const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'skip',
    aliases: ['s'],
    description: 'Skip the current track',
    usage: 'fskip',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");
        if (!player.queue.length) return messages.error(message.channel, "❌ No more tracks in queue to skip to!");
        
        const skipped = player.queue.current;
        player.stop();
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('⏭️ Skip to Next Song')
            .setDescription(`Skipped: **${skipped?.info?.title || 'Unknown'}**`)
            .setFooter({ text: '⚙️ flute music team' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
};
