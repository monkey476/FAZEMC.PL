const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(port);

client.once('ready', () => {
    client.user.setActivity('FAZEMC.PL', { type: 3 });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === 'ping') {
        const reply = await message.reply('Obliczanie pingu...');
        const ping = reply.createdTimestamp - message.createdTimestamp;
        reply.edit(`Ping bota: ${ping}ms | API: ${client.ws.ping}ms`);
    }
});

client.login(process.env.TOKEN).catch(() => {});

process.on('unhandledRejection', () => {});
