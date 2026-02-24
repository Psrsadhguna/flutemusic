const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

module.exports = {
    name: 'seek',
    description: 'Seek to a position in the current track',
    usage: 'fseek <seconds>',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');
        
        // Get current track with fallbacks
        let currentTrack = null;
        if (player.queue && player.queue.current) {
            currentTrack = player.queue.current;
        } else if (player.current) {
            currentTrack = player.current;
        } else if (player.nowPlaying) {
            currentTrack = player.nowPlaying;
        }
        if (!currentTrack) return messages.error(message.channel, '❌ No track is currently playing!');

        const position = parseInt(args[0]) * 1000;
        if (isNaN(position) || position < 0) {
            return messages.error(message.channel, '❌ Please provide a valid number of seconds!');
        }

        player.seek(position);
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('⏩ Track Seeked')
            .setDescription(`Seeked to **${formatTime(args[0])}**`)
            .setFooter({ text: '⚙️ flute music team' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
};
