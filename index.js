require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const express = require('express');

// --- 1. SERWER HTTP (ŻEBY RENDER NIE WYŁĄCZAŁ BOTA) ---
const app = express();
app.get('/', (req, res) => res.send('Bot FAZEMC.PL działa non-stop!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Serwer HTTP nasłuchuje na porcie ${port}`));

// --- 2. KONFIGURACJA BOTA ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// --- 3. CO SIĘ DZIEJE PO WŁĄCZENIU ---
client.once('ready', () => {
    console.log(`Zalogowano jako ${client.user.tag}!`);

    const updateStatus = () => {
        client.user.setPresence({
            activities: [{ 
                name: 'FAZEMC.PL', 
                type: ActivityType.Playing 
            }],
            status: 'online'
        });
    };

    updateStatus();
    setInterval(updateStatus, 1000 * 60 * 60); 
});

// --- 4. ZABEZPIECZENIE PRZED DODAWANIEM NA INNE SERWERY ---
client.on('guildCreate', async (guild) => {
    // TUTAJ PODAJ ID SWOJEGO SERWERA DISCORD (FAZEMC.PL)
    const allowedGuildId = 'TUTAJ_WKLEJ_ID_SERWERA'; 

    if (guild.id !== allowedGuildId) {
        console.log(`Bot został dodany na nieautoryzowany serwer: ${guild.name} (${guild.id}). Wychodzę...`);
        try {
            await guild.leave();
            console.log('Pomyślnie opuszczono nieznany serwer.');
        } catch (error) {
            console.error('Błąd podczas próby wyjścia z serwera:', error);
        }
    }
});

// --- 5. TESTOWA KOMENDA ---
client.on('messageCreate', (message) => {
    if (message.author.bot) return;

    if (message.content === '!ping') {
        message.reply('Pong! Czekam na wgranie skryptów (giveaway, konkurs).');
    }
});

// --- 6. LOGOWANIE DO DISCORDA ---
client.login(process.env.TOKEN);
