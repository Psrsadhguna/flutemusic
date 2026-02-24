const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');

module.exports = {
    name: 'vibrato',
    description: 'Apply vibrato filter',
    usage: 'fvibrato',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            player.filters ??= {};
            const enabled = !player.filters._vibrato;
            player.filters._vibrato = enabled;

            player.filters.vibrato = enabled
                ? { frequency: 2, depth: 0.5 }
                : {};

            await applyFilters(player, message.guild.id);
            messages.success(message.channel, `🎵 Vibrato ${enabled ? '✅ Enabled' : '❌ Disabled'}!`);
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply vibrato!');
        }
    }
};
