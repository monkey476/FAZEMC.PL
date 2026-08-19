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
        GatewayIntentBits.MessageContent // Potrzebne, żeby bot widział treść wiadomości
    ]
});

// --- 3. CO SIĘ DZIEJE PO WŁĄCZENIU ---
client.once('ready', () => {
    console.log(`Zalogowano jako ${client.user.tag}!`);

    // Funkcja do ustawiania statusu
    const updateStatus = () => {
        client.user.setPresence({
            activities: [{ 
                name: 'FAZEMC.PL', // Twój tekst
                type: ActivityType.Playing // Może być też: Watching, Listening, Competing
            }],
            status: 'online' // online, dnd (nie przeszkadzać), idle (zw)
        });
    };

    // Ustawia status od razu po włączeniu
    updateStatus();
    
    // Odświeża status co 1 godzinę (dzięki temu na 100% nigdy nie zniknie)
    setInterval(updateStatus, 1000 * 60 * 60); 
});

// --- 4. TESTOWA KOMENDA ---
client.on('messageCreate', (message) => {
    // Żeby bot nie odpowiadał sam sobie
    if (message.author.bot) return;

    if (message.content === '!ping') {
        message.reply('Pong! Czekam na wgranie skryptów (giveaway, konkurs).');
    }
});

// --- 5. LOGOWANIE DO DISCORDA ---
client.login(process.env.TOKEN);
