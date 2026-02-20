const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');

module.exports = {
    name: 'nightcore',
    description: 'Apply nightcore filter',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        player.filters ??= {};
        const enabled = !player.filters._nightcore;
        player.filters._nightcore = enabled;

        player.filters.timescale = enabled
            ? { speed: 1.2, pitch: 1.2, rate: 1 }
            : {};

        await applyFilters(player, message.guild.id);
        messages.success(message.channel, `🎧 Nightcore ${enabled ? 'Enabled ✅' : 'Disabled ❌'}`);
    }
};
