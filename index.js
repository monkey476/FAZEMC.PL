// index.js

// ❗ Render NIE potrzebuje dotenv – zmienne środowiskowe ustawiasz w panelu
// require('dotenv').config();  <-- USUNIĘTE

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
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Brak DISCORD_TOKEN lub DISCORD_CLIENT_ID w zmiennych środowiskowych.');
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
});

// --- MAPA KONKURSÓW ---
const giveaways = new Map();

// --- POMOCNICZE FUNKCJE ---
function parsePolishDate(dateStr) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const [_, dd, mm, yyyy, hh, min] = match;
  return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min));
}

function hexToNumber(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

function getButtonStyle(styleStr) {
  switch ((styleStr || '').toLowerCase()) {
    case 'primary': return ButtonStyle.Primary;
    case 'secondary': return ButtonStyle.Secondary;
    case 'success': return ButtonStyle.Success;
    case 'danger': return ButtonStyle.Danger;
    default: return ButtonStyle.Primary;
  }
}

function formatDateForDiscord(date) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function pickWinners(participantsSet, count) {
  const arr = Array.from(participantsSet);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

// --- REJESTRACJA KOMEND ---
const commands = [];

const testPowitanieCommand = new SlashCommandBuilder()
  .setName('test-powitanie')
  .setDescription('Symuluje powitanie użytkownika.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const stworzKonkursCommand = new SlashCommandBuilder()
  .setName('stworz-konkurs')
  .setDescription('Tworzy nowy konkurs.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName('tytul').setDescription('Tytuł').setRequired(true))
  .addStringOption(o => o.setName('tresc').setDescription('Treść (\\n = nowa linia)').setRequired(true))
  .addStringOption(o => o.setName('stopka').setDescription('Stopka'))
  .addStringOption(o => o.setName('kolor_hex').setDescription('#ff0000'))
  .addStringOption(o => o.setName('nazwa_przycisku').setDescription('Tekst przycisku').setRequired(true))
  .addStringOption(o => o.setName('kolor_przycisku').setDescription('Primary/Secondary/Success/Danger'))
  .addStringOption(o => o.setName('data_startu').setDescription('DD.MM.YYYY HH:MM').setRequired(true))
  .addStringOption(o => o.setName('data_konca').setDescription('DD.MM.YYYY HH:MM').setRequired(true))
  .addRoleOption(o => o.setName('rola_do_wygrania').setDescription('Rola nagrody').setRequired(true))
  .addIntegerOption(o => o.setName('liczba_zwyciezcow').setDescription('Ilu zwycięzców').setRequired(true));

const losujKonkursCommand = new SlashCommandBuilder()
  .setName('losuj-konkurs')
  .setDescription('Ręcznie kończy konkurs.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName('id_wiadomosci').setDescription('ID wiadomości').setRequired(true));

const rerollKonkursCommand = new SlashCommandBuilder()
  .setName('reroll-konkurs')
  .setDescription('Losuje nowych zwycięzców.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName('id_wiadomosci').setDescription('ID wiadomości').setRequired(true));

const usunZKonkursuCommand = new SlashCommandBuilder()
  .setName('usun-z-konkursu')
  .setDescription('Usuwa użytkownika z konkursu.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName('id_wiadomosci').setDescription('ID wiadomości').setRequired(true))
  .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik').setRequired(true));

commands.push(
  testPowitanieCommand,
  stworzKonkursCommand,
  losujKonkursCommand,
  rerollKonkursCommand,
  usunZKonkursuCommand
);

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('Rejestruję komendy...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log('Komendy zarejestrowane.');
  } catch (err) {
    console.error('Błąd rejestracji komend:', err);
  }
}

// --- BŁĘDY ---
client.on('error', console.error);
client.on('shardError', console.error);
process.on('unhandledRejection', console.error);

// --- POWITANIA ---
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle('🎉 Witamy na FAZEMC.PL!')
      .setDescription(`Hej ${member}, miło Cię widzieć!`)
      .setThumbnail(member.user.displayAvatarURL({ size: 512 }))
      .setColor(0x00aeff)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('Błąd powitania:', e);
  }
});

// --- INTERAKCJE ---
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'test-powitanie') {
        const embed = new EmbedBuilder()
          .setTitle('🔧 Test powitania')
          .setDescription(`Symulacja powitania dla ${interaction.member}.`)
          .setThumbnail(interaction.user.displayAvatarURL({ size: 512 }))
          .setColor(0x00aeff);

        const channel = await interaction.guild.channels.fetch(WELCOME_CHANNEL_ID);
        await channel.send({ embeds: [embed] });
        return interaction.reply({ content: 'Test wysłany.', ephemeral: true });
      }

      if (interaction.commandName === 'stworz-konkurs') {
        const title = interaction.options.getString('tytul');
        const rawContent = interaction.options.getString('tresc');
        const footer = interaction.options.getString('stopka') || '';
        const colorHex = interaction.options.getString('kolor_hex') || '#00aeff';
        const buttonLabel = interaction.options.getString('nazwa_przycisku');
        const buttonColorStr = interaction.options.getString('kolor_przycisku') || 'Primary';
        const startStr = interaction.options.getString('data_startu');
        const endStr = interaction.options.getString('data_konca');
        const role = interaction.options.getRole('rola_do_wygrania');
        const winnersCount = interaction.options.getInteger('liczba_zwyciezcow');

        const startDate = parsePolishDate(startStr);
        const endDate = parsePolishDate(endStr);

        if (!startDate || !endDate)
          return interaction.reply({ content: '❌ Zły format daty.', ephemeral: true });

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
            `🏆 Zwycięzców: **${winnersCount}**\n` +
            `👥 Uczestników: **0**`
          )
          .setColor(color)
          .setFooter({ text: footer })
          .setTimestamp();

        const button = new ButtonBuilder()
          .setCustomId('giveaway-join')
          .setLabel(buttonLabel)
          .setStyle(buttonStyle);

        const row = new ActionRowBuilder().addComponents(button);

        const channel = await interaction.guild.channels.fetch(GIVEAWAY_CHANNEL_ID);
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

        return interaction.reply({
          content: `Konkurs utworzony. ID: \`${message.id}\``,
          ephemeral: true,
        });
      }

      if (interaction.commandName === 'losuj-konkurs') {
        const id = interaction.options.getString('id_wiadomosci');
        const giveaway = giveaways.get(id);
        if (!giveaway)
          return interaction.reply({ content: '❌ Nie ma takiego konkursu.', ephemeral: true });

        giveaway.finished = true;

        const guild = interaction.guild;
        const channel = await guild.channels.fetch(GIVEAWAY_CHANNEL_ID);
        const message = await channel.messages.fetch(id);

        const winners = pickWinners(giveaway.participants, giveaway.winnersCount);

        const role = await guild.roles.fetch(giveaway.roleId);
        for (const w of winners) {
          try {
            const member = await guild.members.fetch(w);
            await member.roles.add(role);
          } catch {}
        }

        const embed = EmbedBuilder.from(message.embeds[0]);
        embed.setDescription(
          `${giveaway.description}\n\n` +
          `🏆 Zwycięzcy: ${winners.map(w => `<@${w}>`).join(', ') || 'Brak'}`
        );

        await message.edit({ embeds: [embed], components: [] });

        return interaction.reply({ content: 'Zakończono konkurs.', ephemeral: true });
      }

      if (interaction.commandName === 'reroll-konkurs') {
        const id = interaction.options.getString('id_wiadomosci');
        const giveaway = giveaways.get(id);
        if (!giveaway)
          return interaction.reply({ content: '❌ Nie ma takiego konkursu.', ephemeral: true });

        const guild = interaction.guild;
        const channel = await guild.channels.fetch(GIVEAWAY_CHANNEL_ID);
        const message = await channel.messages.fetch(id);

        const winners = pickWinners(giveaway.participants, giveaway.winnersCount);

        const role = await guild.roles.fetch(giveaway.roleId);
        for (const w of winners) {
          try {
            const member = await guild.members.fetch(w);
            await member.roles.add(role);
          } catch {}
        }

        const embed = EmbedBuilder.from(message.embeds[0]);
        embed.setDescription(
          `${giveaway.description}\n\n` +
          `🔁 Nowi zwycięzcy: ${winners.map(w => `<@${w}>`).join(', ') || 'Brak'}`
        );

        await message.edit({ embeds: [embed] });

        return interaction.reply({ content: 'Reroll wykonany.', ephemeral: true });
      }

      if (interaction.commandName === 'usun-z-konkursu') {
        const id = interaction.options.getString('id_wiadomosci');
        const user = interaction.options.getUser('uzytkownik');

        const giveaway = giveaways.get(id);
        if (!giveaway)
          return interaction.reply({ content: '❌ Nie ma takiego konkursu.', ephemeral: true });

        giveaway.participants.delete(user.id);

        return interaction.reply({
          content: `Usunięto ${user.tag} z konkursu.`,
          ephemeral: true,
        });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'giveaway-join') {
        const giveaway = giveaways.get(interaction.message.id);
        if (!giveaway)
          return interaction.reply({ content: 'Ten konkurs już nie istnieje.', ephemeral: true });

        if (giveaway.finished)
          return interaction.reply({ content: 'Konkurs zakończony.', ephemeral: true });

        if (giveaway.participants.has(interaction.user.id))
          return interaction.reply({ content: 'Już bierzesz udział.', ephemeral: true });

        giveaway.participants.add(interaction.user.id);

        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.setDescription(
          embed.data.description.replace(
            /👥 Uczestników: \*\d+\*/,
            `👥 Uczestników: **${giveaway.participants.size}**`
          )
        );

        await interaction.message.edit({ embeds: [embed] });

        return interaction.reply({ content: 'Dołączono!', ephemeral: true });
      }
    }
  } catch (err) {
    console.error('Błąd interakcji:', err);
  }
});

// --- AUTOMATYCZNE LOSOWANIE ---
setInterval(async () => {
  const now = new Date();
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  for (const [id, giveaway] of giveaways.entries()) {
    if (!giveaway.finished && giveaway.endDate <= now) {
      try {
        const channel = await guild.channels.fetch(GIVEAWAY_CHANNEL_ID);
        const message = await channel.messages.fetch(id);

        const winners = pickWinners(giveaway.participants, giveaway.winnersCount);
        const role = await guild.roles.fetch(giveaway.roleId);

        for (const w of winners) {
          try {
            const member = await guild.members.fetch(w);
            await member.roles.add(role);
          } catch {}
        }

        const embed = EmbedBuilder.from(message.embeds[0]);
        embed.setDescription(
          `${giveaway.description}\n\n` +
          `🏆 Zwycięzcy: ${winners.map(w => `<@${w}>`).join(', ') || 'Brak'}`
        );

        await message.edit({ embeds: [embed], components: [] });

        giveaway.finished = true;
      } catch (err) {
        console.error('Auto-losowanie błąd:', err);
      }
    }
  }
}, 60000);

// --- START ---
(async () => {
  await registerCommands();

  client.once(Events.ClientReady, (c) => {
    console.log(`Zalogowano jako ${c.user.tag}`);
  });

  client.login(TOKEN).catch(console.error);
})();
