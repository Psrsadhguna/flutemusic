const messages = require('../utils/messages.js');

module.exports = {
    name: '247',
    description: 'Toggle 24/7 mode - bot stays in voice channel',
    usage: 'f247',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        // Toggle 24/7 mode
        player.twentyFourSeven = !player.twentyFourSeven;

        // Track 24/7 servers
        if (global.stats && global.stats.twentyFourSevenServers) {
            if (player.twentyFourSeven) {
                global.stats.twentyFourSevenServers.add(message.guild.id);
            } else {
                global.stats.twentyFourSevenServers.delete(message.guild.id);
            }
        }

        const status = player.twentyFourSeven ? "Enabled" : "Disabled";

        messages.success(
            message.channel,
            `🎵 24/7 Mode ${status}!`
        );
    }
};