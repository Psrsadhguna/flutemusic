const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'replay',
    aliases: ['rp', 'repeat-one'],
    description: 'Replay the current song from the beginning',
    usage: 'freplay',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");
        
        // Get current track with fallbacks
        let currentTrack = null;
        if (player.queue && player.queue.current) {
            currentTrack = player.queue.current;
        } else if (player.current) {
            currentTrack = player.current;
        } else if (player.nowPlaying) {
            currentTrack = player.nowPlaying;
        }
        
        if (!currentTrack) {
            return messages.error(message.channel, "❌ No track is currently playing!");
        }

        try {
            // Seek to the beginning (0 milliseconds)
            player.seek(0);
            
            const embed = new EmbedBuilder()
                .setColor('#0075FF')
                .setTitle('🔄 Replaying Song')
                .setDescription(`**${currentTrack.info.title}**`)
                .addFields([
                    {
                        name: '🎤 Artist',
                        value: currentTrack.info.author || 'Unknown',
                        inline: true
                    },
                    {
                        name: '⏱️ Duration',
                        value: formatDuration(currentTrack.info.length),
                        inline: true
                    }
                ])
                .setFooter({ text: '⚙️ flute music team' })
                .setTimestamp();
            
            if (currentTrack.info.thumbnail) {
                embed.setThumbnail(currentTrack.info.thumbnail);
            }
            
            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            messages.error(message.channel, "❌ Failed to replay song!");
        }
    }
};

// Duration formatter helper
const formatDuration = (ms) => {
    if (!ms || ms <= 0 || ms === 'Infinity') return 'Live';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
