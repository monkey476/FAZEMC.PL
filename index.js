const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const TARGET_CHANNEL_ID = '1291748341331529789';

// Bezpieczna baza danych w pamięci bota (brak błędów plikowych na Renderze!)
const konkursyBaza = new Map();

const app = express();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName('stworz-konkurs')
        .setDescription('Tworzy nowy konkurs i wysyła go na dedykowany kanał')
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
        .addStringOption(o => o.setName('data_rozpoczecia').setDescription('Data rozpoczęcia (np. 11.06.2026 22:00)').setRequired(true))
        .addStringOption(o => o.setName('data_zakonczenia').setDescription('Data zakończenia (np. 18.06.2026 22:00)').setRequired(true))
        .addRoleOption(o => o.setName('rola').setDescription('Rola do wygrania').setRequired(true))
        .addIntegerOption(o => o.setName('zwyciezcy').setDescription('Liczba zwycięzców').setRequired(true))
        .addStringOption(o => o.setName('obrazek').setDescription('Link URL do obrazka/gifa w embedzie').setRequired(false)),

    new SlashCommandBuilder()
        .setName('losuj-konkurs')
        .setDescription('Losuje zwycięzców wybranego konkursu')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o => o.setName('id_wiadomosci').setDescription('ID wiadomości z konkursem').setRequired(true)),

    new SlashCommandBuilder()
        .setName('reroll-konkurs')
        .setDescription('Losuje nowego zwycięzcę (reroll)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o => o.setName('id_wiadomosci').setDescription('ID wiadomości z konkursem').setRequired(true)),

    new SlashCommandBuilder()
        .setName('usun-z-konkursu')
        .setDescription('Usuwa użytkownika z listy uczestników konkursu')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(o => o.setName('id_wiadomosci').setDescription('ID wiadomości z konkursem').setRequired(true))
        .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik do usunięcia').setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`🚀 Bot FAZEMC.PL działa!`);
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Komendy załadowane!');
    } catch (err) { console.error(err); }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

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

        const kanal = client.channels.cache.get(TARGET_CHANNEL_ID);
        if (!kanal) return interaction.editReply('Nie odnaleziono kanału.');

        const embed = new EmbedBuilder()
            .setTitle(tytul)
            .setDescription(`${tresc}\n\n**📅 Rozpoczęcie:** ${start}\n**⏳ Zakończenie:** ${koniec}\n**🏆 Nagroda:** ${rola}\n**👥 Liczba zwycięzców:** ${zwycięzcyIlosc}\n\n*Uczestników: 0*`)
            .setColor(kolor.startsWith('#') ? kolor : `#${kolor}`)
            .setFooter({ text: `${stopka} | ${start}` });

        if (obrazek) embed.setImage(obrazek);

        const btnStyle = ButtonStyle[kolor_przycisku];
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join_konkurs').setLabel(nazwa_przycisku).setStyle(btnStyle)
        );

        const msg = await kanal.send({ embeds: [embed], components: [row] });

        konkursyBaza.set(msg.id, {
            guildId: interaction.guildId,
            rolaId: rola.id,
            ilosc: zwycięzcyIlosc,
            uczestnicy: [],
            zwyciezcy: [],
            embedData: { tytul, tresc, stopka, kolor, start, koniec, obrazek }
        });

        await interaction.editReply(`Konkurs utworzony! ID: \`${msg.id}\``);
    }

    if (commandName === 'losuj-konkurs' || commandName === 'reroll-konkurs') {
        await interaction.deferReply({ ephemeral: true });
        const msgId = interaction.options.getString('id_wiadomosci');
        const data = konkursyBaza.get(msgId);

        if (!data) return interaction.editReply('Nie znaleziono takiego konkursu.');
        if (data.uczestnicy.length === 0) return interaction.editReply('Brak uczestników.');

        const wylosowani = [];
        const kopiaUczestnikow = [...data.uczestnicy];
        const ileLosowac = commandName === 'reroll-konkurs' ? 1 : Math.min(data.ilosc, kopiaUczestnikow.length);

        for (let i = 0; i < ileLosowac; i++) {
            const index = Math.floor(Math.random() * kopiaUczestnikow.length);
            wylosowani.push(kopiaUczestnikow.splice(index, 1)[0]);
        }

        const guild = client.guilds.cache.get(data.guildId);
        const kanal = client.channels.cache.get(TARGET_CHANNEL_ID);

        try {
            const msg = await kanal.messages.fetch(msgId);
            
            for (const userId of wylosowani) {
                try {
                    const member = await guild.members.fetch(userId);
                    if (member) await member.roles.add(data.rolaId);
                } catch (e) {}
            }

            let nowiZwyciezcy = commandName === 'reroll-konkurs' ? [...data.zwyciezcy, ...wylosowani] : wylosowani;
            data.zwyciezcy = nowiZwyciezcy;
            konkursyBaza.set(msgId, data);

            const wzmianki = wylosowani.map(id => `<@${id}>`).join(', ');
            const staryEmbed = msg.embeds[0];
            const edytowanyEmbed = EmbedBuilder.from(staryEmbed)
                .setDescription(`${data.embedData.tresc}\n\n**📅 Rozpoczęcie:** ${data.embedData.start}\n**⏳ Zakończenie:** ${data.embedData.koniec}\n**🏆 Nagroda:** <@&${data.rolaId}>\n\n**🎉 ZWYCIĘZCY:** ${nowiZwyciezcy.map(id => `<@${id}>`).join(', ')}`);

            await msg.edit({ embeds: [edytowanyEmbed], components: [] });
            await kanal.send(`🎉 **Wydarzenie zakończone!**\n${commandName === 'reroll-konkurs' ? '🔄 Reroll:' : '🏆 Zwycięzcy:'} ${wzmianki}\nRanga została nadana!`);
            await interaction.editReply('Wylosowano!');
        } catch (err) {
            await interaction.editReply('Błąd edycji.');
        }
    }

    if (commandName === 'usun-z-konkursu') {
        const msgId = interaction.options.getString('id_wiadomosci');
        const user = interaction.options.getUser('uzytkownik');
        const data = konkursyBaza.get(msgId);

        if (!data || !data.uczestnicy.includes(user.id)) {
            return interaction.reply({ content: 'Brak gracza na liście.', ephemeral: true });
        }

        data.uczestnicy = data.uczestnicy.filter(id => id !== user.id);
        konkursyBaza.set(msgId, data);

        try {
            const kanal = client.channels.cache.get(TARGET_CHANNEL_ID);
            const msg = await kanal.messages.fetch(msgId);
            const staryEmbed = msg.embeds[0];
            const edytowanyEmbed = EmbedBuilder.from(staryEmbed)
                .setDescription(`${data.embedData.tresc}\n\n**📅 Rozpoczęcie:** ${data.embedData.start}\n**⏳ Zakończenie:** ${data.embedData.koniec}\n**🏆 Nagroda:** <@&${data.rolaId}>\n**👥 Liczba zwycięzców:** ${data.ilosc}\n\n*Uczestników: ${data.uczestnicy.length}*`);
            await msg.edit({ embeds: [edytowanyEmbed] });
        } catch(e){}

        await interaction.reply({ content: `Usunięto gracza.`, ephemeral: true });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'join_konkurs') return;

    const msgId = interaction.message.id;
    const data = konkursyBaza.get(msgId);

    if (!data) return interaction.reply({ content: 'Konkurs przedawniony.', ephemeral: true });
    if (data.uczestnicy.includes(interaction.user.id)) {
        return interaction.reply({ content: 'Już bierzesz udział!', ephemeral: true });
    }

    data.uczestnicy.push(interaction.user.id);
    konkursyBaza.set(msgId, data);

    const staryEmbed = interaction.message.embeds[0];
    const edytowanyEmbed = EmbedBuilder.from(staryEmbed)
        .setDescription(`${data.embedData.tresc}\n\n**📅 Rozpoczęcie:** ${data.embedData.start}\n**⏳ Zakończenie:** ${data.embedData.koniec}\n**🏆 Nagroda:** <@&${data.rolaId}>\n**👥 Liczba zwycięzców:** ${data.ilosc}\n\n*Uczestników: ${data.uczestnicy.length}*`);

    await interaction.message.edit({ embeds: [edytowanyEmbed] });
    await interaction.reply({ content: '🎉 Zapisano Cię do konkursu!', ephemeral: true });
});

client.login(TOKEN);

app.get('/', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 3000);
