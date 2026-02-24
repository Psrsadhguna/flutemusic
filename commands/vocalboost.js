const messages = require('../utils/messages.js');

module.exports = {
    name: 'vocalboost',
    description: 'Apply vocal boost effect',
    usage: 'fvocalboost',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player)
            return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            if (!player.filters) player.filters = {};
            const enabled = !player.filters._vocalboost;
            player.filters._vocalboost = enabled;

            await player.node.rest.updatePlayer({
                guildId: message.guild.id,
                data: {
                    filters: {
                        equalizer: enabled
                            ? [
                                { band: 0, gain: -0.05 },
                                { band: 1, gain: 0 },
                                { band: 2, gain: 0.15 },
                                { band: 3, gain: 0.2 },
                                { band: 4, gain: 0.15 },
                                { band: 5, gain: 0 }
                              ]
                            : []
                    }
                }
            });

            messages.success(
                message.channel,
                `🎘 Vocal Boost ${enabled ? '✅ Enabled' : '❌ Disabled'}!`
            );

        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply vocal boost!');
        }
    }
};
