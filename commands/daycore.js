const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');
const { requirePremium } = require('../utils/requirePremium');

module.exports = {
    name: 'daycore',
    description: 'Apply daycore filter (Premium Only)',
    usage: 'fdaycore',
    execute: async (message, args, client) => {
        if (!await requirePremium(message)) return;
        
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            player.filters ??= {};
            const enabled = !player.filters._daycore;
            player.filters._daycore = enabled;

            player.filters.timescale = enabled
                ? { speed: 0.8, pitch: 0.8, rate: 1 }
                : {};

            await applyFilters(player, message.guild.id);
            messages.success(message.channel, `🌞 Daycore ${enabled ? '✅ Enabled' : '❌ Disabled'}!`);
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply daycore!');
        }
    }
};
