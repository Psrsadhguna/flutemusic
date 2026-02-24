const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'clearqueue',
    description: 'Clear the entire queue',
    usage: 'fclearqueue',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');
        if (!player.queue.length) return messages.error(message.channel, '❌ Queue is already empty!');

        const clearedCount = player.queue.length;
        player.queue.clear();
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🗑️ Queue Cleared')
            .setDescription(`Removed **${clearedCount}** tracks from the queue!\nCurrent track will continue playing.`)
            .setFooter({ text: '⚙️ flute music team' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
};
