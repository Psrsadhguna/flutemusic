const messages = require('../utils/messages.js');

module.exports = {
    name: 'lofi',
    description: 'Apply lofi effect',
    usage: 'flofi',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            if (!player.filters) player.filters = {};
            const enabled = !player.filters._lofi;
            player.filters._lofi = enabled;

            await player.node.rest.updatePlayer({
                guildId: message.guild.id,
                data: {
                    filters: {
                        equalizer: enabled
                            ? [
                                { band: 0, gain: 0.15 },
                                { band: 1, gain: 0.1 },
                                { band: 2, gain: 0 },
                                { band: 3, gain: -0.1 },
                                { band: 4, gain: -0.15 },
                                { band: 5, gain: -0.15 }
                              ]
                            : []
                    }
                }
            });

            messages.success(
                message.channel,
                `☕ Lofi ${enabled ? '✅ Enabled' : '❌ Disabled'}!`
            );

        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply lofi effect!');
        }
    }
};
