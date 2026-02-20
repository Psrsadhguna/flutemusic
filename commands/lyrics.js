const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'lyrics',
    description: 'Get lyrics for the current track',
    usage: 'flyrics [song name]',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        
        let songName = args.join(' ');
        
        if (!songName && !player?.queue.current) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('📝 Lyrics Command')
                .setDescription('You need to either:\n\n1️⃣ **Play a track** - Use `fplay <song>` to start playing\n2️⃣ **Provide a song name** - Use `flyrics <artist> - <song name>`')
                .addFields([
                    {
                        name: '📌 Examples',
                        value: '`flyrics The Weeknd Blinding Lights`\n`flyrics Ed Sheeran Shape of You`',
                        inline: false
                    }
                ])
                .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
                .setTimestamp();
            return message.channel.send({ embeds: [embed] });
        }

        if (!songName && player.queue.current) {
            songName = `${player.queue.current.info.author} ${player.queue.current.info.title}`;
        }

        await message.channel.send('🔍 Searching for lyrics...');

        try {
            // Lyrics fetching would require an API or library
            // This is a placeholder showing how it would work
            const embed = new EmbedBuilder()
                .setColor('#0061ff')
                .setTitle(`📋 Lyrics - ${songName}`)
                .setDescription('Lyrics feature coming soon! 🎵\n\nIntegrate with a lyrics API like:\n• Genius\n• AZLyrics\n• Musixmatch')
                .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to fetch lyrics!');
        }
    }
};
