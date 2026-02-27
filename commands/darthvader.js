const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');
const { requirePremium } = require('../utils/requirePremium');

module.exports = {
    name: 'darthvader',
    description: 'Apply darthvader filter (Premium Only)',
    usage: 'fdarthvader',
    execute: async (message, args, client) => {
        if (!await requirePremium(message)) return;
        
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            player.filters ??= {};
            const enabled = !player.filters._darthvader;
            player.filters._darthvader = enabled;

            player.filters.timescale = enabled
                ? { speed: 0.9, pitch: 0.7, rate: 1 }
                : {};

            await applyFilters(player, message.guild.id);
            messages.success(message.channel, `🎭 Darth Vader ${enabled ? '✅ Enabled' : '❌ Disabled'}!`);
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply darthvader!');
        }
    }
};
