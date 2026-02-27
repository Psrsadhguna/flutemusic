const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');
const { requirePremium } = require('../utils/requirePremium');

module.exports = {
    name: 'slowmode',
    description: 'Apply slowmode filter (Premium Only)',
    usage: 'fslowmode',
    execute: async (message, args, client) => {
        if (!await requirePremium(message)) return;
        
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            player.filters ??= {};
            const enabled = !player.filters._slowmode;
            player.filters._slowmode = enabled;

            player.filters.timescale = enabled
                ? { speed: 0.5, pitch: 1, rate: 1 }
                : {};

            await applyFilters(player, message.guild.id);
            messages.success(message.channel, `🐢 Slow Mode ${enabled ? '✅ Enabled' : '❌ Disabled'}!`);
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply slow mode!');
        }
    }
};
