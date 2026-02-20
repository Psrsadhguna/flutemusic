const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');
const cfg = require('../config.js');

module.exports = {
    name: 'stop',
    aliases: ['st'],
    description: 'Stop playback and clear queue',
    usage: 'fstop',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");
        
        player.destroy();
        
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏹️ Music Stopped')
            .setDescription('Stopped the music and cleared the queue!')
            .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
};
