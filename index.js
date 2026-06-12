// index.js
require('dotenv').config();

const express = require('express');
const app = express();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  SlashCommandBuilder,
  Routes,
  REST,
  PermissionFlagsBits,
} = require('discord.js');

// --- KONFIGURACJA STAŁA ---
const GUILD_ID = '1285980506474680401';
const GIVEAWAY_CHANNEL_ID = '1291748341331529789';
const WELCOME_CHANNEL_ID = '1291077819954364457';
const LOG_CHANNEL_ID = '1483940235472666754';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID; // Application ID (Client ID) z Developer Portal

if (!TOKEN || !CLIENT_ID) {
  console.error('Brak DISCORD_TOKEN lub DISCORD_CLIENT_ID w zmiennych środowiskowych.');
  process.exit(1);
}

// --- EXPRESS KEEP-ALIVE ---
app.get('/', (req, res) => {
  res.send('FAZEMC.PL Discord bot is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express listening on port ${PORT}`);
});

// --- KLIENT DISCORD ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,   // Privileged: włączone w Developer Portal
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Privileged: włączone w Developer Portal
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
});

// --- MAPA KONKURSÓW ---
/**
 * giveaways: Map<messageId, {
 *   title: string,
 *   description: string,
 *   footer: string,
 *   color: number,
 *   buttonLabel: string,
 *   buttonStyle: ButtonStyle,
 *   startDate: Date,
 *   endDate: Date,
 *   roleId: string,
 *   winnersCount: number,
 *   participants: Set<string>,
 *   finished: boolean
 * }>
 */
const giveaways = new Map();

// --- POMOCNICZE FUNKCJE ---

function parsePolishDate(dateStr) {
  // Format: DD.MM.YYYY HH:MM
  // Przykład: "12.06.2026 19:30"
  const match = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const [_, dd, mm, yyyy, hh, min] = match;
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10) - 1;
  const year = parseInt(yyyy, 10);
  const hour = parseInt(hh, 10);
  const minute = parseInt(min, 10);
  const d = new Date(year, month, day, hour, minute);
  if (isNaN(d.getTime())) return null;
  return d;
}

function hexToNumber(hex) {
  try {
    return parseInt(hex.replace('#', ''), 16);
  } catch {
    return 0x2f3136; // domyślny ciemny kolor
  }
}

function getButtonStyle(styleStr) {
  switch ((styleStr || '').toLowerCase()) {
    case 'primary':
      return ButtonStyle.Primary;
    case 'secondary':
      return ButtonStyle.Secondary;
    case 'success':
      return ButtonStyle.Success;
    case 'danger':
      return ButtonStyle.Danger;
    default:
      return ButtonStyle.Primary;
  }
}

function formatDateForDiscord(date) {
  const unix = Math.floor(date.getTime() / 1000);
  return `<t:${unix}:F>`;
}

function pickWinners(participantsSet, count) {
  const arr = Array.from(participantsSet);
  if (arr.length === 0) return [];
  // prosty shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// --- REJESTRACJA KOMEND SLASH (API v10) ---

const commands = [];

// /test-powitanie
const testPowitanieCommand = new SlashCommandBuilder()
  .setName('test-powitanie')
  .setDescription('Symuluje powitanie użytkownika na kanale powitań.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// /stworz-konkurs
const stworzKonkursCommand = new SlashCommandBuilder()
  .setName('stworz-konkurs')
  .setDescription('Tworzy nowy konkurs na kanale konkursowym.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt.setName('tytul')
      .setDescription('Tytuł konkursu')
      .setRequired(true),
  )
  .addStringOption(opt =>
    opt.setName('tresc')
      .setDescription('Treść konkursu (obsługa \\n dla nowych linii)')
      .setRequired(true),
  )
  .addStringOption(opt =>
    opt.setName('stopka')
      .setDescription('Stopka embeda')
      .setRequired(false),
  )
  .addStringOption(opt =>
    opt.setName('kolor_hex')
      .setDescription('Kolor embeda w formacie HEX, np. #ff0000')
      .setRequired(false),
  )
  .addStringOption(opt =>
    opt.setName('nazwa_przycisku')
      .setDescription('Tekst na przycisku zapisu do konkursu')
      .setRequired(true),
  )
  .addStringOption(opt =>
    opt.setName('kolor_przycisku')
      .setDescription('Kolor przycisku (Primary/Secondary/Success/Danger)')
      .setRequired(false),
  )
  .addStringOption(opt =>
    opt.setName('data_startu')
      .setDescription('Data rozpoczęcia (DD.MM.YYYY HH:MM)')
      .setRequired(true),
  )
  .addStringOption(opt =>
    opt.setName('data_konca')
      .setDescription('Data zakończenia (DD.MM.YYYY HH:MM)')
      .setRequired(true),
  )
  .addRoleOption(opt =>
    opt.setName('rola_do_wygrania')
      .setDescription('Rola, która zostanie nadana zwycięzcom')
      .setRequired(true),
  )
  .addIntegerOption(opt =>
    opt.setName('liczba_zwyciezcow')
      .setDescription('Liczba zwycięzców')
      .setRequired(true),
  );

// /losuj-konkurs
const losujKonkursCommand = new SlashCommandBuilder()
  .setName('losuj-konkurs')
  .setDescription('Ręcznie kończy konkurs i losuje zwycięzców.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt.setName('id_wiadomosci')
      .setDescription('ID wiadomości z konkursem')
      .setRequired(true),
  );

// /reroll-konkurs
const rerollKonkursCommand = new SlashCommandBuilder()
  .setName('reroll-konkurs')
  .setDescription('Losuje nowych zwycięzców dla istniejącego konkursu.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt.setName('id_wiadomosci')
      .setDescription('ID wiadomości z konkursem')
      .setRequired(true),
  );

// /usun-z-konkursu
const usunZKonkursuCommand = new SlashCommandBuilder()
  .setName('usun-z-konkursu')
  .setDescription('Usuwa użytkownika z listy uczestników konkursu.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt.setName('id_wiadomosci')
      .setDescription('ID wiadomości z konkursem')
      .setRequired(true),
  )
  .addUserOption(opt =>
    opt.setName('uzytkownik')
      .setDescription('Użytkownik do usunięcia z konkursu')
      .setRequired(true),
  );

commands.push(
  testPowitanieCommand,
  stworzKonkursCommand,
  losujKonkursCommand,
  rerollKonkursCommand,
  usunZKonkursuCommand,
);

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('Rejestracja komend slash...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands.map(cmd => cmd.toJSON()) },
    );
    console.log('Komendy slash zarejestrowane.');
  } catch (error) {
    console.error('Błąd rejestracji komend slash:', error);
  }
}

// --- OBSŁUGA BŁĘDÓW KLIENTA ---

client.on('error', (error) => {
  console.error('client error:', error);
});

client.on('shardError', (error) => {
  console.error('shard error:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

// --- POWITANIA ---

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID)
      || await member.guild.channels.fetch(WELCOME_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) return;

    const avatarURL = member.user.displayAvatarURL({ size: 512, extension: 'png' });

    const embed = new EmbedBuilder()
      .setTitle('🎉 Witamy na FAZEMC.PL!')
      .setDescription(`Hej ${member}, cieszymy się, że do nas dołączyłeś!`)
      .setThumbnail(avatarURL)
      .setColor(0x00aeff)
      .setFooter({ text: `ID użytkownika: ${member.id}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID)
      || await member.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send(`✅ Nowy członek: ${member.user.tag} (${member.id}) dołączył do serwera.`);
    }
  } catch (error) {
    console.error('Błąd w GuildMemberAdd:', error);
  }
});

// --- INTERAKCJE (SLASH + BUTTONY) ---

async function handleTestPowitanie(interaction) {
  const member = interaction.member;
  const guild = interaction.guild;

  if (!guild) {
    return interaction.reply({ content: 'Ta komenda działa tylko na serwerze.', ephemeral: true });
  }

  const avatarURL = member.user.displayAvatarURL({ size: 512, extension: 'png' });

  const embed = new EmbedBuilder()
    .setTitle('🔧 Test powitania')
    .setDescription(`To jest symulacja powitania dla ${member}.`)
    .setThumbnail(avatarURL)
    .setColor(0x00aeff)
    .setFooter({ text: `ID użytkownika: ${member.id}` })
    .setTimestamp();

  const channel = guild.channels.cache.get(WELCOME_CHANNEL_ID)
    || await guild.channels.fetch(WELCOME_CHANNEL_ID);

  if (!channel || !channel.isTextBased()) {
    return interaction.reply({
      content: 'Nie mogę znaleźć kanału powitań lub nie jest tekstowy.',
      ephemeral: true,
    });
  }

  await channel.send({ embeds: [embed] });
  await interaction.reply({ content: '✅ Test powitania wysłany.', ephemeral: true });
}

async function handleStworzKonkurs(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: 'Ta komenda działa tylko na serwerze.', ephemeral: true });
  }

  const title = interaction.options.getString('tytul', true);
  const rawContent = interaction.options.getString('tresc', true);
  const footer = interaction.options.getString('stopka') || '';
  const colorHex = interaction.options.getString('kolor_hex') || '#00aeff';
  const buttonLabel = interaction.options.getString('nazwa_przycisku', true);
  const buttonColorStr = interaction.options.getString('kolor_przycisku') || 'Primary';
  const startStr = interaction.options.getString('data_startu', true);
  const endStr = interaction.options.getString('data_konca', true);
  const role = interaction.options.getRole('rola_do_wygrania', true);
  const winnersCount = interaction.options.getInteger('liczba_zwyciezcow', true);

  const startDate = parsePolishDate(startStr);
  const endDate = parsePolishDate(endStr);

  if (!startDate || !endDate) {
    return interaction.reply({
      content: '❌ Nieprawidłowy format daty. Użyj DD.MM.YYYY HH:MM.',
      ephemeral: true,
    });
  }

  if (endDate <= startDate) {
    return interaction.reply({
      content: '❌ Data zakończenia musi być późniejsza niż data rozpoczęcia.',
      ephemeral: true,
    });
  }

  const description = rawContent.replace(/\\n/g, '\n');
  const color = hexToNumber(colorHex);
  const buttonStyle = getButtonStyle(buttonColorStr);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      `${description}\n\n` +
      `📅 Start: ${formatDateForDiscord(startDate)}\n` +
      `📅 Koniec: ${formatDateForDiscord(endDate)}\n` +
      `🎁 Nagroda: ${role}\n` +
      `🏆 Liczba zwycięzców: **${winnersCount}**\n` +
      `👥 Uczestników: **0**`,
    )
    .setColor(color)
    .setFooter({ text: footer || 'Konkurs FAZEMC.PL' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('giveaway-join')
    .setLabel(buttonLabel)
    .setStyle(buttonStyle);

  const row = new ActionRowBuilder().addComponents(button);

  const channel = guild.channels.cache.get(GIVEAWAY_CHANNEL_ID)
    || await guild.channels.fetch(GIVEAWAY_CHANNEL_ID);

  if (!channel || !channel.isTextBased()) {
    return interaction.reply({
      content: 'Nie mogę znaleźć kanału konkursowego lub nie jest tekstowy.',
      ephemeral: true,
    });
  }

  const message = await channel.send({ embeds: [embed], components: [row] });

  giveaways.set(message.id, {
    title,
    description,
    footer,
    color,
    buttonLabel,
    buttonStyle,
    startDate,
    endDate,
    roleId: role.id,
    winnersCount,
    participants: new Set(),
    finished: false,
  });

  await interaction.reply({
    content: `✅ Konkurs utworzony. ID wiadomości: \`${message.id}\``,
    ephemeral: true,
  });
}

async function updateGiveawayMessageParticipants(message, giveaway) {
  const embed = EmbedBuilder.from(message.embeds[0] ?? new EmbedBuilder());
  const participantsCount = giveaway.participants.size;

  const desc = embed.data.description || '';
  const newDesc = desc.replace(/👥 Uczestników: \*\d+\*/g, `👥 Uczestników: **${participantsCount}**`);

  embed.setDescription(newDesc);

  await message.edit({ embeds: [embed] });
}

async function handleGiveawayButton(interaction) {
  const message = interaction.message;
  const giveaway = giveaways.get(message.id);

  if (!giveaway) {
    return interaction.reply({
      content: 'Ten konkurs nie jest już aktywny lub nie został poprawnie zarejestrowany.',
      ephemeral: true,
    });
  }

  if (giveaway.finished) {
    return interaction.reply({
      content: 'Ten konkurs został już zakończony.',
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;

  if (giveaway.participants.has(userId)) {
    return interaction.reply({
      content: 'Już bierzesz udział w tym konkursie. ✨',
      ephemeral: true,
    });
  }

  giveaway.participants.add(userId);

  await updateGiveawayMessageParticipants(message, giveaway);

  await interaction.reply({
    content: '✅ Zapisano Cię do konkursu!',
    ephemeral: true,
  });
}

async function drawGiveaway(guild, messageId, options = { reroll: false }) {
  const giveaway = giveaways.get(messageId);
  if (!giveaway) {
    throw new Error('Nie znaleziono konkursu o podanym ID wiadomości.');
  }

  const channel = guild.channels.cache.get(GIVEAWAY_CHANNEL_ID)
    || await guild.channels.fetch(GIVEAWAY_CHANNEL_ID);

  if (!channel || !channel.isTextBased()) {
    throw new Error('Kanał konkursowy nie jest tekstowy lub nie istnieje.');
  }

  const message = await channel.messages.fetch(messageId);

  const winners = pickWinners(giveaway.participants, giveaway.winnersCount);

  giveaway.finished = true;

  const role = guild.roles.cache.get(giveaway.roleId)
    || await guild.roles.fetch(giveaway.roleId);

  const winnerMentions = [];

  for (const winnerId of winners) {
    try {
      const member = await guild.members.fetch(winnerId);
      if (role) {
        await member.roles.add(role);
      }
      winnerMentions.push(`<@${winnerId}>`);
    } catch (error) {
      console.error(`Nie udało się nadać roli użytkownikowi ${winnerId}:`, error);
    }
  }

  const embed = EmbedBuilder.from(message.embeds[0] ?? new EmbedBuilder());
  const baseDesc = giveaway.description;

  let resultText;
  if (winners.length === 0) {
    resultText = '❌ Brak zwycięzców (nikt nie wziął udziału).';
  } else {
    resultText = `🏆 Zwycięzcy: ${winnerMentions.join(', ')}`;
  }

  embed
    .setDescription(
      `${baseDesc}\n\n` +
      `📅 Start: ${formatDateForDiscord(giveaway.startDate)}\n` +
      `📅 Koniec: ${formatDateForDiscord(giveaway.endDate)}\n` +
      `🎁 Nagroda: <@&${giveaway.roleId}>\n` +
      `🏆 Liczba zwycięzców: **${giveaway.winnersCount}**\n` +
      `👥 Uczestników: **${giveaway.participants.size}**\n\n` +
      resultText,
    )
    .setFooter({ text: giveaway.footer || 'Konkurs zakończony' });

  await message.edit({ embeds: [embed], components: [] });

  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID)
    || await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

  const infoText = options.reroll
    ? `🔁 Reroll konkursu \`${messageId}\`.\n${resultText}`
    : `✅ Konkurs \`${messageId}\` zakończony.\n${resultText}`;

  if (logChannel && logChannel.isTextBased()) {
    await logChannel.send(infoText);
  }

  await channel.send(infoText);
}

async function handleLosujKonkurs(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: 'Ta komenda działa tylko na serwerze.', ephemeral: true });
  }

  const messageId = interaction.options.getString('id_wiadomosci', true);

  try {
    await drawGiveaway(guild, messageId, { reroll: false });
    await interaction.reply({
      content: `✅ Konkurs \`${messageId}\` został ręcznie zakończony i wylosowano zwycięzców.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Błąd w losuj-konkurs:', error);
    await interaction.reply({
      content: `❌ Błąd: ${error.message}`,
      ephemeral: true,
    });
  }
}

async function handleRerollKonkurs(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: 'Ta komenda działa tylko na serwerze.', ephemeral: true });
  }

  const messageId = interaction.options.getString('id_wiadomosci', true);

  try {
    await drawGiveaway(guild, messageId, { reroll: true });
    await interaction.reply({
      content: `🔁 Wykonano reroll konkursu \`${messageId}\`.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Błąd w reroll-konkurs:', error);
    await interaction.reply({
      content: `❌ Błąd: ${error.message}`,
      ephemeral: true,
    });
  }
}

async function handleUsunZKonkursu(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: 'Ta komenda działa tylko na serwerze.', ephemeral: true });
  }

  const messageId = interaction.options.getString('id_wiadomosci', true);
  const user = interaction.options.getUser('uzytkownik', true);

  const giveaway = giveaways.get(messageId);
  if (!giveaway) {
    return interaction.reply({
      content: '❌ Nie znaleziono konkursu o podanym ID wiadomości.',
      ephemeral: true,
    });
  }

  if (!giveaway.participants.has(user.id)) {
    return interaction.reply({
      content: 'Ten użytkownik nie jest zapisany do konkursu.',
      ephemeral: true,
    });
  }

  giveaway.participants.delete(user.id);

  try {
    const channel = guild.channels.cache.get(GIVEAWAY_CHANNEL_ID)
      || await guild.channels.fetch(GIVEAWAY_CHANNEL_ID);

    if (channel && channel.isTextBased()) {
      const message = await channel.messages.fetch(messageId);
      await updateGiveawayMessageParticipants(message, giveaway);
    }
  } catch (error) {
    console.error('Błąd przy aktualizacji wiadomości konkursu:', error);
  }

  await interaction.reply({
    content: `✅ Użytkownik ${user.tag} został usunięty z konkursu \`${messageId}\`.`,
    ephemeral: true,
  });
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'test-powitanie':
          await handleTestPowitanie(interaction);
          break;
        case 'stworz-konkurs':
          await handleStworzKonkurs(interaction);
          break;
        case 'losuj-konkurs':
          await handleLosujKonkurs(interaction);
          break;
        case 'reroll-konkurs':
          await handleRerollKonkurs(interaction);
          break;
        case 'usun-z-konkursu':
          await handleUsunZKonkursu(interaction);
          break;
        default:
          break;
      }
    } else if (interaction.isButton()) {
      if (interaction.customId === 'giveaway-join') {
        await handleGiveawayButton(interaction);
      }
    }
  } catch (error) {
    console.error('Błąd w InteractionCreate:', error);
    if (interaction.isRepliable()) {
      try {
        await interaction.reply({
          content: '❌ Wystąpił nieoczekiwany błąd podczas obsługi interakcji.',
          ephemeral: true,
        });
      } catch {
        // ignoruj
      }
    }
  }
});

// --- AUTOMATYCZNE LOSOWANIE CO 60 SEKUND ---

setInterval(async () => {
  try {
    const now = new Date();
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    for (const [messageId, giveaway] of giveaways.entries()) {
      if (giveaway.finished) continue;
      if (giveaway.endDate <= now) {
        console.log(`Automatyczne zakończenie konkursu ${messageId}`);
        try {
          await drawGiveaway(guild, messageId, { reroll: false });
        } catch (error) {
          console.error(`Błąd automatycznego losowania konkursu ${messageId}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Błąd w automatycznym losowaniu:', error);
  }
}, 60 * 1000);

// --- START BOTA ---

(async () => {
  await registerCommands();

  client.once(Events.ClientReady, (c) => {
    console.log(`Zalogowano jako ${c.user.tag}`);
  });

  client.login(TOKEN).catch((error) => {
    console.error('Błąd podczas logowania klienta:', error);
  });
})();
