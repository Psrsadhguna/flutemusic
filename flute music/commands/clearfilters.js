const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');

module.exports = {
    name: 'clearfilters',
    description: 'Clear all active filters',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        player.filters = {};

        await applyFilters(player, message.guild.id);
        messages.success(message.channel, '🧹 All filters cleared!');
    }
};
