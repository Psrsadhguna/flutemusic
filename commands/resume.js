const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'resume',
    aliases: ['r'],
    description: 'Resume the current track',
    usage: 'fresume',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");
        if (!player.paused) return messages.error(message.channel, "❌ The player is already playing!");
        
        const currentTrack = player.queue.current;
        player.pause(false);
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('▶️ Music Resumed')
            .setDescription(`Resumed: **${currentTrack?.info?.title || 'Unknown'}**`)
            .setFooter({ text: '⚙️ flute music team' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
};
