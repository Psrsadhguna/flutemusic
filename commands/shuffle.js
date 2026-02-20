const messages = require('../utils/messages.js');
const emojis = require('../emojis.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'shuffle',
    aliases: ['sh'],
    description: 'Shuffle the current queue',
    usage: 'fshuffle',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");
        if (!player.queue.length) return messages.error(message.channel, "❌ Not enough tracks in queue to shuffle!");

        player.queue.shuffle();
        
        const embed = new EmbedBuilder()
            .setColor('#9C27B0')
            .setTitle('🔀 Queue Shuffled')
            .setDescription(`Queue has been shuffled! **${player.queue.length}** tracks remaining.`)
            .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
};
