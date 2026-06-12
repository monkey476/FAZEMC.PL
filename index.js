const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const BAZA_PATH = path.join(__dirname, 'konkursy_baza.json');
const app = express();

// --- PEŁNA KONFIGURACJA KANAŁÓW ---
const KANAL_KONKURSY_ID = '1291748341331529789'; 
const KANAL_LOGI_ID = '1291748341331529789';     
const KANAL_POWITANIA_ID = '1291748341331529789'; 

const BACKGROUND_URL = 'https://i.ibb.co/3mYmGvN/enderman-welcome.png';

let konkursyBaza = new Map();

if (fs.existsSync(BAZA_PATH)) {
    try {
        const dane = JSON.parse(fs.readFileSync(BAZA_PATH, 'utf8'));
        konkursyBaza = new Map(Object.entries(dane));
        console.log('📦 Baza danych konkursów wczytana.');
    } catch (e) { console.error(e); }
}

function zapiszBazeDoPliku() {
    const obiekt = Object.fromEntries(konkursyBaza);
    fs.writeFileSync(BAZA_PATH, JSON.stringify(obiekt, null, 2), 'utf8');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
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
        .addUserOption(o => o.setName('uzytkownik').setDescription('Użytkownik do usunięcia').setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log('==================================================');
    console.log(`🟢 SUKCES: Bot FAZEMC.PL zalogował się do Discorda!`);
    console.log(`🤖 Nazwa bota: ${client.user.tag}`);
    console.log('==================================================');
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('⚡ Komendy ukończone i zarejestrowane!');
    } catch (err) { console.error(err); }

    // Pętla sprawdzająca czas automatycznego zakończenia konkursu
    setInterval(async () => {
        const teraz = new Date();
        for (const [msgId, data] of konkursyBaza.entries()) {
            if (data.zakonczony) continue;
            try {
                const matches = data.embedData.koniec.match(/\d+/g);
                if (!matches || matches.length < 5) continue;
                const [d, m, y, h, min] = matches;
                const dataKonwersji = new Date(y, m - 1, d, h, min);
                if (teraz >= dataKonwersji) {
                    await uruchomLosowanie(msgId, false);
                }
            } catch (e) { console.error('Błąd pętli czasowej:', e); }
        }
    }, 60000);
});

// ================= DYNAMICZNY GENERATOR POWITAŃ PROSTO Z ENDU =================
client.on('guildMemberAdd', async member => {
    const kanalPowitan = client.channels.cache.get(KANAL_POWITANIA_ID);
    if (!kanalPowitan) return;

    try {
        const canvas = createCanvas(1200, 400);
        const ctx = canvas.getContext('2d');
        const background = await loadImage(BACKGROUND_URL);
        ctx.drawImage(background, 0, 0, 1200, 400);

        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImage = await loadImage(avatarURL);

        ctx.save();
        ctx.beginPath();
        ctx.arc(600, 238, 54, 0, Math.PI * 2, true); 
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImage, 546, 184, 108, 108);
        ctx.restore();

        ctx.font = 'bold 34px sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 5;
        ctx.fillText(member.user.username, 600, 335);

        ctx.font = '20px sans-serif';
        ctx.fillStyle = '#CFA1ED';
        ctx.fillText('Witaj na serwerze FAZEMC.PL', 600, 365);

        const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: `welcome-${member.user.id}.png` });
        await kanalPowitan.send({ content: `👋 Witamy na pokładzie ${member}!`, files: [attachment] });
    } catch (err) { console.error(err); }
});

// ================= MECHANIKA OBSŁUGI KONKURSÓW =================
async function uruchomLosowanie(msgId, isReroll = false) {
    const data = konkursyBaza.get(msgId);
    if (!data || (data.zakonczony && !isReroll)) return;

    const kanalKonkursy = client.channels.cache.get(data.kanalId || KANAL_KONKURSY_ID);
    const kanalLogi = client.channels.cache.get(KANAL_LOGI_ID);

    if (data.uczestnicy.length === 0) {
        if (kanalKonkursy) {
            try {
                const msg = await kanalKonkursy.messages.fetch(msgId);
                await msg.edit({ components: [] });
                await kanalKonkursy.send(`❌ Konkurs \`${msgId}\` dobiegł końca, brak uczestników.`);
            } catch(e){}
        }
        data.zakonczony = true;
        konkursyBaza.set(msgId, data);
        zapiszBazeDoPliku();
        return;
    }

    const wylosowani = [];
    const kopiaUczestnikow = [...data.uczestnicy];
    const ileLosowac = isReroll ? 1 : Math.min(data.ilosc, kopiaUczestnikow.length);

    for (let i = 0; i < ileLosowac; i++) {
        const index = Math.floor(Math.random() * kopiaUczestnikow.length);
        wylosowani.push(kopiaUczestnikow.splice(index, 1)[0]);
    }

    const guild = client.guilds.cache.get(data.guildId);
    for (const userId of wylosowani) {
        try {
            const member = await guild.members.fetch(userId);
            if (member) await member.roles.add(data.rolaId);
        } catch (e) {}
    }

    let nowiZwyciezcy = isReroll ? [...data.zwyciezcy, ...wylosowani] : wylosowani;
    data.zwyciezcy = nowiZwyciezcy;
    if (!isReroll) data.zakonczony = true;
    
    konkursyBaza.set(msgId, data);
    zapiszBazeDoPliku();

    try {
        const msg = await kanalKonkursy.messages.fetch(msgId);
        const staryEmbed = msg.embeds[0];
        const edytowanyEmbed = EmbedBuilder.from(staryEmbed)
            .setDescription(`${data.embedData.tresc}\n\n**📅 Rozpoczęcie:** ${data.embedData.start}\n**⏳ Zakończenie:** ${data.embedData.koniec}\n**🏆 Nagroda:** <@&${data.rolaId}>\n\n**🎉 ZWYCIĘZCY:** ${nowiZwyciezcy.map(id => `<@${id}>`).join(', ')}`);

        await msg.edit({ embeds: [edytowanyEmbed], components: [] });
        await kanalKonkursy.send(`🎉 **Wyniki konkursu!**\n${isReroll ? '🔄 Nowy wylosowany (Reroll):' : '🏆 Zwycięzcy:'} ${wylosowani.map(id => `<@${id}>`).join(', ')}\nNagrody przyznano automatycznie!`);
        
        if (kanalLogi) {
            await kanalLogi.send(`📝 **[LOGI LOSOWAŃ]** Konkurs \`${msgId}\` rozstrzygnięty. Zwycięzcy: ${wylosowani.map(id => `<@${id}>`).join(', ')}.`);
        }
    } catch (err) { console.error(err); }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    if (commandName === 'stworz-konkurs') {
        await interaction.reply({ content: '⏳ Generowanie nowego konkursu...', flags: [MessageFlags.Ephemeral] });
        
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
        if (!kanalKonkursowy) return interaction.editReply('❌ Błąd konfiguracji kanałów.');

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
            zapiszBazeDoPliku();

            await interaction.editReply({ content: `✅ Konkurs wysłany na kanał <#${KANAL_KONKURSY_ID}>! ID: \`${msg.id}\`` });
        } catch (error) {
            await interaction.editReply({ content: '❌ Błąd przy wysyłaniu embedu.' });
        }
    }

    if (commandName === 'losuj-konkurs') {
        await interaction.reply({ content: '⏳ Losowanie...', flags: [MessageFlags.Ephemeral] });
        const msgId = interaction.options.getString('id_wiadomosci');
        if (!konkursyBaza.has(msgId)) return interaction.editReply('Nie odnaleziono konkursu.');
        await uruchomLosowanie(msgId, false);
        await interaction.editReply('Losowanie wykonane.');
    }

    if (commandName === 'reroll-konkurs') {
        await interaction.reply({ content: '⏳ Trwa reroll...', flags: [MessageFlags.Ephemeral] });
        const msgId = interaction.options.getString('id_wiadomosci');
        if (!konkursyBaza.has(msgId)) return interaction.editReply('Nie odnaleziono podanego ID.');
        await uruchomLosowanie(msgId, true);
        await interaction.editReply('Reroll wykonany.');
    }

    if (commandName === 'usun-z-konkursu') {
        await interaction.reply({ content: '⏳ Usuwanie gracza...', flags: [MessageFlags.Ephemeral] });
        const msgId = interaction.options.getString('id_wiadomosci');
        const user = interaction.options.getUser('uzytkownik');
        const data = konkursyBaza.get(msgId);

        if (!data || !data.uczestnicy.includes(user.id)) {
            return interaction.editReply('Gracz nie znajduje się na liście.');
        }

        data.uczestnicy = data.uczestnicy.filter(id => id !== user.id);
        konkursyBaza.set(msgId, data);
        zapiszBazeDoPliku();

        try {
            const kanal = client.channels.cache.get(data.kanalId || KANAL_KONKURSY_ID);
            const msg = await kanal.messages.fetch(msgId);
            const staryEmbed = msg.embeds[0];
            const edytowanyEmbed = EmbedBuilder.from(staryEmbed)
                .setDescription(`${data.embedData.tresc}\n\n**📅 Rozpoczęcie:** ${data.embedData.start}\n**⏳ Zakończenie:** ${data.embedData.koniec}\n**🏆 Nagroda:** <@&${data.rolaId}>\n**👥 Liczba zwycięzców:** ${data.ilosc}\n\n*Uczestników: ${data.uczestnicy.length}*`);
            await msg.edit({ embeds: [edytowanyEmbed] });
        } catch(e){}

        await interaction.editReply(`Użytkownik został skreślony.`);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'join_konkurs') return;

    const msgId = interaction.message.id;
    const data = konkursyBaza.get(msgId);

    if (!data || data.zakonczony) {
        return interaction.reply({ content: 'Ten konkurs dobiegł już końca.', flags: [MessageFlags.Ephemeral] });
    }
    if (data.uczestnicy.includes(interaction.user.id)) {
        return interaction.reply({ content: 'Jesteś już zapisany!', flags: [MessageFlags.Ephemeral] });
    }

    data.uczestnicy.push(interaction.user.id);
    konkursyBaza.set(msgId, data);
    zapiszBazeDoPliku();

    const staryEmbed = interaction.message.embeds[0];
    const edytowanyEmbed = EmbedBuilder.from(staryEmbed)
        .setDescription(`${data.embedData.tresc}\n\n**📅 Rozpoczęcie:** ${data.embedData.start}\n**⏳ Zakończenie:** ${data.embedData.koniec}\n**🏆 Nagroda:** <@&${data.rolaId}>\n**👥 Liczba zwycięzców:** ${data.ilosc}\n\n*Uczestników: ${data.uczestnicy.length}*`);

    await interaction.message.edit({ embeds: [edytowanyEmbed] });
    await interaction.reply({ content: `🎉 Zostałeś zapisany! Jesteś ${data.uczestnicy.length} na liście.`, flags: [MessageFlags.Ephemeral] });
});

console.log('⏳ Próba logowania do Discorda...');
client.login(TOKEN).then(() => {
    console.log('🔓 Token zaakceptowany przez Discord API!');
}).catch(err => {
    console.error('❌ BŁĄD LOGOWANIA:', err.message);
});

app.get('/', (req, res) => res.send('OK'));
app.listen(process.env.PORT || 3000, () => {
    console.log('🌐 Serwer Web Express uruchomiony.');
});
