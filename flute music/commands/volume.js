const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'volume',
    description: 'Adjust player volume',
    usage: 'fvolume <0-100>',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");
        
        const volume = parseInt(args[0]);
        if (!volume && volume !== 0 || isNaN(volume) || volume < 0 || volume > 100) {
            return messages.error(message.channel, "❌ Please provide a valid volume between 0 and 100!");
        }

        player.setVolume(volume);
        
        const volumeBar = '█'.repeat(Math.floor(volume / 10)) + '░'.repeat(10 - Math.floor(volume / 10));
        
        const embed = new EmbedBuilder()
            .setColor('#00D4FF')
            .setTitle('🔊 Volume Adjusted')
            .setDescription(`Volume set to **${volume}%**\n\n${volumeBar}`)
            .setFooter({ text: '⚙️ flute music team' })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    }
};
