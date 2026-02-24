const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');

module.exports = {
    name: 'karaoke',
    description: 'Apply karaoke filter',
    usage: 'fkaraoke',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            player.filters ??= {};
            const enabled = !player.filters._karaoke;
            player.filters._karaoke = enabled;

            player.filters.karaoke = enabled
                ? { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 }
                : {};

            await applyFilters(player, message.guild.id);
            messages.success(message.channel, `🌂 Karaoke ${enabled ? '✅ Enabled' : '❌ Disabled'}!`);
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply karaoke!');
        }
    }
};
