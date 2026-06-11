const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName('konkursy')
        .setDescription('Wyświetla aktualne konkursy i wydarzenia na serwerze FAZEMC.PL'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Informacje o projekcie i statusie prac nad FAZEMC.PL')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🚀 Bot FAZEMC.PL jest ONLINE jako ${client.user.tag}!`);
    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        console.log('Odświeżanie komend aplikacji (/)...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Komendy (/) zarejestrowane pomyślnie!');
    } catch (error) {
        console.error('Błąd podczas rejestracji komend:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'konkursy') {
        const konkursyEmbed = new EmbedBuilder()
            .setColor('#DA70D6')
            .setTitle('🏆 AKTUALNE KONKURSY - FAZEMC.PL')
            .setDescription('W tym miejscu będą wyświetlane wszystkie oficjalne konkursy organizowane na naszej sieci serwerów!')
            .addFields(
                { name: '🎉 Obecne wydarzenia:', value: 'Aktualnie trwają przygotowania techniczne. Śledź ten kanał, aby nie przegapić startu pierwszego wielkiego konkursu na otwarcie!' },
                { name: '📌 Jak wziąć udział?', value: 'Wszystkie szczegóły oraz warunki uczestnictwa zostaną opublikowane już wkrótce.' }
            )
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || null)
            .setFooter({ text: 'stworzony przez mr.monkax  |  © 2026 fazemc.pl' });

        await interaction.reply({ embeds: [konkursyEmbed] });
    }

    if (commandName === 'status') {
        const statusEmbed = new EmbedBuilder()
            .setColor('#DA70D6')
            .setTitle('⚙️ STATUS PROJEKTU - FAZEMC.PL')
            .setDescription('Trwają zaawansowane prace konfiguracyjne nad infrastrukturą sieci oraz bota serwerowego.')
            .addFields(
                { name: '💻 Prace programistyczne:', value: '`W TOKU` (Optymalizacja kodu i bazy danych)' },
                { name: '🌐 Strona WWW:', value: '`W BUDOWIE` (Wdrażanie zaawansowanego interfejsu na platformie Render)' }
            )
            .setFooter({ text: 'stworzony przez mr.monkax  |  © 2026 fazemc.pl' });

        await interaction.reply({ embeds: [statusEmbed] });
    }
});

client.login(TOKEN);
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(process.env.PORT || 3000, () => console.log('Port otwarty dla Rendera!'));
