const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const BAZA_PATH = path.join(__dirname, 'konkursy_baza.json');
const app = express();

const KANAL_KONKURSY_ID = '1291748341331529789'; 
const KANAL_LOGI_ID = '1291748341331529789';     
const KANAL_POWITANIA_ID = '1291748341331529789'; 

const BACKGROUND_URL = 'https://i.ibb.co/3mYmGvN/enderman-welcome.png';

let konkursyBaza = new Map();

if (fs.existsSync(BAZA_PATH)) {
    try {
        const dane = JSON.parse(fs.readFileSync(BAZA_PATH, 'utf8'));
        konkursyBaza = new Map(Object.entries(dane));
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
        .addStringOption(o => o.setName('obrazek').setDescription('Link URL do obrazka/gifa w embedzie').setRequired(false))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log('==================================================');
    console.log(`🟢 SUKCES: Bot FAZEMC.PL zalogował się do Discorda!`);
    console.log(`🤖 Nazwa bota: ${client.user.tag}`);
    console.log('==================================================');
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (err) { console.error(err); }
});

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
