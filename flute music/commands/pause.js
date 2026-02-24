const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'pause',
    aliases: ['pa'],
    description: 'Pause the current track',
    usage: 'fpause',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");
        if (player.paused) return messages.error(message.channel, "❌ The player is already paused!");
        
        const currentTrack = player.queue.current;
        player.pause(true);
        
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⏸️ Music Paused')
            .setDescription(`Paused: **${currentTrack?.info?.title || 'Unknown'}**`)
            .setFooter({ text: '⚙️ flute music team' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
};
