const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'lyrics',
    description: 'Get lyrics for the current track',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        
        let songName = args.join(' ');
        
        // Get current track with fallbacks
        let currentTrack = null;
        if (player && player.queue && player.queue.current) {
            currentTrack = player.queue.current;
        } else if (player && player.current) {
            currentTrack = player.current;
        } else if (player && player.nowPlaying) {
            currentTrack = player.nowPlaying;
        }
        
        if (!songName && !currentTrack) {
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
                .setFooter({ text: '⚙️ flute music team' })
                .setTimestamp();
            return message.channel.send({ embeds: [embed] });
        }

        if (!songName && currentTrack) {
            songName = `${currentTrack.info.author} ${currentTrack.info.title}`;
        }

        await message.channel.send('🔍 Searching for lyrics...');

        try {
            // Lyrics fetching would require an API or library
            // This is a placeholder showing how it would work
            const embed = new EmbedBuilder()
                .setColor('#0061ff')
                .setTitle(`📋 Lyrics - ${songName}`)
                .setDescription('Lyrics feature coming soon! 🎵\n\nIntegrate with a lyrics API like:\n• Genius\n• AZLyrics\n• Musixmatch')
                .setFooter({ text: '⚙️ flute music team' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to fetch lyrics!');
        }
    }
};
