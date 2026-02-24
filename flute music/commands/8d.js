const messages = require('../utils/messages.js');

module.exports = {
    name: '8d',
    description: 'Apply 8D surround sound filter',
    usage: 'f8d',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player)
            return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            if (!player.filters) player.filters = {};
            const enabled = !player.filters._8d;
            player.filters._8d = enabled;

            await player.node.rest.updatePlayer({
                guildId: message.guild.id,
                data: {
                    filters: {
                        rotation: enabled ? { rotationHz: 0.2 } : {}
                    }
                }
            });

            messages.success(
                message.channel,
                `🌌 8D Surround ${enabled ? '✅ Enabled' : '❌ Disabled'}!`
            );

        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply 8D!');
        }
    }
};
