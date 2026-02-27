const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');
const { requirePremium } = require('../utils/requirePremium');

module.exports = {
    name: 'tremolo',
    description: 'Apply tremolo filter (Premium Only)',
    usage: 'ftremolo',
    execute: async (message, args, client) => {
        if (!await requirePremium(message)) return;
        
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            player.filters ??= {};
            const enabled = !player.filters._tremolo;
            player.filters._tremolo = enabled;

            player.filters.tremolo = enabled
                ? { frequency: 2, depth: 0.5 }
                : {};

            await applyFilters(player, message.guild.id);
            messages.success(message.channel, `∾️ Tremolo ${enabled ? '✅ Enabled' : '❌ Disabled'}!`);
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply tremolo!');
        }
    }
};
