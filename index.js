const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const app = express();

const GUILD_ID = '1285980506474680401'; 
const KANAL_KONKURSY_ID = '1291748341331529789'; 
const KANAL_POWITANIA_ID = '1291077819954364457'; 
const KANAL_LOGI_ID = '1483940235472666754'; 

const konkursyBaza = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    rest: { version: '10' }
});

const commands = [
    new SlashCommandBuilder()
        .setName('stworz-konkurs')
        .setDescription('Tworzy nowy konkurs')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o => o.setName('tytul').setDescription('Tytuł embeda').setRequired(true))
        .addStringOption(o => o.setName('tresc').setDescription('Treść embeda (użyj \\n dla nowej linii)').setRequired(true))
        .addStringOption(o => o.setName('stopka').setDescription('Stopka embeda').setRequired(true))
        .addStringOption(o => o.setName('kolor').setDescription('Kolor w hex (np. #DA70D6)').setRequired(true))
        .addStringOption(o => o.setName('nazwa_przycisku').setDescription('Napis na przycisku do zapisu').setRequired(true))
        .addStringOption(o => o.setName('kolor_przycisku').setDescription('Kolor przycisku').setRequired(true)
            .addChoices(
                { name: 'Niebieski (Primary)', value: 'Primary' },
                { name: 'Szary (Secondary)', value: 'Secondary' },
                { name: 'Zielony (Success)', value: 'Success' },
                { name: 'Czerwony (Danger)', value: 'Danger' }
            ))
        .addStringOption(o => o.setName('data_rozpoczecia').setDescription('Data rozpoczęcia (np. 12.06.2026 13:00)').setRequired(true))
        .addStringOption(o => o.setName('data_zakonczenia').setDescription('Data zakończenia (np. 19.06.2026 18:00)').setRequired(true))
        .addRoleOption(o => o.setName('rola').setDescription('Rola do wygrania').setRequired(true))
        .addIntegerOption(o => o.setName('zwyciezcy').setDescription('Liczba zwycięzców').setRequired(true))
        .addStringOption(o => o.setName('obrazek').setDescription('Link URL do obrazka/gifa w embedzie').setRequired(false)),

    new SlashCommandBuilder()
        .setName('losuj-konkurs')
        .setDescription('Manualne losowanie zwycięzców konkursu')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o => o.setName('id_wiadomosci').setDescription('ID wiadomości z konkursem').setRequired(true)),

    new SlashCommandBuilder()
        .setName('reroll-konkurs')
        .setDescription('Losuje nowego zwycięzcę (reroll)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o => o.setName('id_wiadomosci').setDescription('ID wiadomości z konkursem').setRequired(true)),

    new SlashCommandBuilder()
        .setName('usun-z-konkursu')
        .setDescription('Usuwa użytkownika z listy uczestników')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o => o.setName('id_wiadomosci').setDescription('ID wiadomości z konkursem').setRequired(true))
        .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik do usunięcia').setRequired(true)),

    new SlashCommandBuilder()
        .setName('test-powitanie')
        .setDescription('Wysyła testową wiadomość powitalną')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(cmd => cmd.toJSON());

// REJESTRACJA KOMEND WYMUSZONA PRZY STARCIE - NIE CZEKA NA DISCORDA
async function zarejestrujKomendy() {
    if (!TOKEN) return console.log('❌ Brak tokenu do rejestracji komend!');
    try {
        console.log('🔄 Rozpoczynam natychmiastową rejestrację komend slash...');
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        // Automatyczne pobieranie ID bota z tokenu, żeby nie było pomyłek
        const base64User = TOKEN.split('.')[0];
        const botId = Buffer.from(base64User, 'base64').toString('utf-8');
        
        await rest.put(
            Routes.applicationGuildCommands(botId, GUILD_ID),
            { body: commands }
        );
        console.log('🚀 [SUKCES] Komendy zostały pomyślnie zarejestrowane na Twoim serwerze!');
    } catch (err) {
        console.error('❌ Błąd krytyczny API podczas rejestracji komend:', err.message);
    }
}

client.once('ready', () => {
    console.log(`🟢 BOT WSTAŁ: Zalogowano jako ${client.user.tag}`);
});

async function wyslijPowitanie(member) {
    const kanalPowitan = client.channels.cache.get(KANAL_POWITANIA_ID);
    if (!kanalPowitan) return;
    const embedPowitalny = new EmbedBuilder()
        .setTitle('👋 Nowy gracz na pokładzie!')
        .setDescription(`Witaj **${member.user.username}** na serwerze **FAZEMC.PL**!\n\nŻyczymy miłej zabawy! 🔥`)
        .setColor('#CFA1ED')
        .setTimestamp();
    await kanalPowitan.send({ content: `✨ Siemanko ${member}!`, embeds: [embedPowitalny] });
}

client.on('guildMemberAdd', async member => {
    try { await wyslijPowitanie(member); } catch (err) { console.error(err); }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    if (commandName === 'test-powitanie') {
        await interaction.deferReply({ ephemeral: true });
        try {
            await wyslijPowitanie(interaction.member);
            await interaction.editReply({ content: '✅ Testowe powitanie wysłane!' });
        } catch (e) {
            await interaction.editReply({ content: `❌ Błąd: ${e.message}` });
        }
    }

    if (commandName === 'stworz-konkurs') {
        await interaction.deferReply({ ephemeral: true });
        const tytul = interaction.options.getString('tytul');
        const tresc = interaction.options.getString('tresc').replace(/\\n/g, '\n');
        const stopka = interaction.options.getString('stopka');
        const kolor = interaction.options.getString('kolor');
        const nazwa_przycisku = interaction.options.getString('nazwa_przycisku');
        const kolor_przycisku = interaction.options.getString('kolor_przycisku');
        const start = interaction.options.getString('data_rozpoczecia');
        const koniec = interaction.options.getString('data_zakonczenia');
        const rola = interaction.options.getRole('rola');
        const zwycięzcyIlosc = interaction.options.getInteger('zwyciezcy');
        const obrazek = interaction.options.getString('obrazek');

        const kanalKonkursowy = client.channels.cache.get(KANAL_KONKURSY_ID);
        if (!kanalKonkursowy) return interaction.editReply('❌ Kanał konkursowy nie odpowiada.');

        const embed = new EmbedBuilder()
            .setTitle(tytul)
            .setDescription(`${tresc}\n\n**📅 Start:** ${start}\n**⏳ Koniec:** ${koniec}\n**🏆 Nagroda:** ${rola}\n\n*Uczestników: 0*`)
            .setColor(kolor.startsWith('#') ? kolor : `#${kolor}`)
            .setFooter({ text: stopka });

        if (obrazek) embed.setImage(obrazek);

        const btnStyle = ButtonStyle[kolor_przycisku];
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join_konkurs').setLabel(nazwa_przycisku).setStyle(btnStyle)
        );

        try {
            const msg = await kanalKonkursowy.send({ embeds: [embed], components: [row] });
            konkursyBaza.set(msg.id, {
                guildId: interaction.guildId,
                kanalId: kanalKonkursowy.id,
                rolaId: rola.id,
                ilosc: zwycięzcyIlosc,
                uczestnicy: [],
                zwyciezcy: [],
                zakonczony: false,
                embedData: { tytul, tresc, stopka, kolor, start, koniec, obrazek }
            });
            await interaction.editReply({ content: `✅ Konkurs utworzony! ID wiadomości: \`${msg.id}\`` });
        } catch (error) {
            await interaction.editReply({ content: '❌ Nie udało się wysłać panelu konkursowego.' });
        }
    }
});

// URUCHOMIENIE PROCEDUR
console.log('🚀 Odpalanie systemów bota...');
zarejestrujKomendy().then(() => {
    if (TOKEN) {
        console.log('📡 Próba nawiązania sesji z Discord Gateway...');
        client.login(TOKEN).catch(err => console.error('❌ Błąd logowania:', err.message));
    } else {
        console.error('❌ BŁĄD: Brak zmiennej DISCORD_TOKEN w zakładce Environment na Renderze!');
    }
});

app.get('/', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Serwer Web gotowy.'));
