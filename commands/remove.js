const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'remove',
    description: 'Remove a track from queue',
    usage: 'fremove <position>',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");
        
        const position = parseInt(args[0]);
        if (!position || isNaN(position) || position < 1 || position > player.queue.length) {
            return messages.error(message.channel, `❌ Please provide a valid track position between 1 and ${player.queue.length}!`);
        }

        const removed = player.queue.remove(position - 1);
        
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🗑️ Track Removed')
            .setDescription(`Removed **${removed.info.title}** from the queue`)
            .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
};
