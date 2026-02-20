const messages = require('../utils/messages.js');

module.exports = {
    name: '247',
    description: 'Toggle 24/7 mode - bot keeps playing music',
    usage: 'f247',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        // Toggle 24/7 mode
        player.twentyFourSeven = !player.twentyFourSeven;
        const status = player.twentyFourSeven ? '✅ Enabled' : '❌ Disabled';

        // Track 24/7 servers
        if (player.twentyFourSeven) {
            if (global.stats && global.stats.twentyFourSevenServers) {
                global.stats.twentyFourSevenServers.add(message.guild.id);
            }
        } else {
            if (global.stats && global.stats.twentyFourSevenServers) {
                global.stats.twentyFourSevenServers.delete(message.guild.id);
            }
        }

        messages.success(message.channel, `🎵 24/7 Mode ${status}! The bot will ${player.twentyFourSeven ? 'keep playing songs' : 'stop when the queue ends'}.`);
    }
};
