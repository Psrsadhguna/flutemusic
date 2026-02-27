const messages = require('../utils/messages.js');
const { requirePremium } = require('../utils/requirePremium');

module.exports = {
    name: 'soft',
    description: 'Apply soft filter (Premium Only)',
    usage: 'fsoft',
    execute: async (message, args, client) => {
        if (!await requirePremium(message)) return;
        
        const player = client.riffy.players.get(message.guild.id);
        if (!player)
            return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            if (!player.filters) player.filters = {};
            const enabled = !player.filters._soft;
            player.filters._soft = enabled;

            await player.node.rest.updatePlayer({
                guildId: message.guild.id,
                data: {
                    filters: {
                        equalizer: enabled
                            ? [
                                { band: 0, gain: -0.05 },
                                { band: 1, gain: -0.1 },
                                { band: 2, gain: -0.05 },
                                { band: 3, gain: 0 },
                                { band: 4, gain: 0 },
                                { band: 5, gain: -0.05 }
                              ]
                            : []
                    }
                }
            });

            messages.success(
                message.channel,
                `🌸 Soft ${enabled ? '✅ Enabled' : '❌ Disabled'}!`
            );

        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply soft filter!');
        }
    }
};
