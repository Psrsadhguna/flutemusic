const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'move',
    description: 'Move a track to a different position in queue',
    usage: 'fmove <from> <to>',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        const from = parseInt(args[0]);
        const to = parseInt(args[1]);

        if (!from || !to || isNaN(from) || isNaN(to) || from < 1 || to < 1 || from > player.queue.length || to > player.queue.length) {
            return messages.error(message.channel, `❌ Please provide valid positions between 1 and ${player.queue.length}!`);
        }

        const track = player.queue[from - 1];
        player.queue.splice(from - 1, 1);
        player.queue.splice(to - 1, 0, track);

        const embed = new EmbedBuilder()
            .setColor('#00D4FF')
            .setTitle('🔄 Track Moved')
            .setDescription(`Moved **${track.info.title}** from position #${from} to #${to}`)
            .setFooter({ text: '⚙️ flute music team' })
            .setTimestamp();
        
        message.channel.send({ embeds: [embed] });
    }
};
