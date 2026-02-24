const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');

module.exports = {
    name: 'doubletime',
    description: 'Apply doubletime filter',
    usage: 'fdoubletime',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            player.filters ??= {};
            const enabled = !player.filters._doubletime;
            player.filters._doubletime = enabled;

            player.filters.timescale = enabled
                ? { speed: 1.5, pitch: 1, rate: 1 }
                : {};

            await applyFilters(player, message.guild.id);
            messages.success(message.channel, `⏱️ Double Time ${enabled ? '✅ Enabled' : '❌ Disabled'}!`);
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply doubletime!');
        }
    }
};
