const messages = require('../utils/messages.js');

module.exports = {
    name: 'cleareffects',
    description: 'Clear all audio effects',
    usage: 'fcleareffects',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        try {
            player.filters = {};
            
            await player.node.rest.updatePlayer({
                guildId: message.guild.id,
                data: {
                    filters: {
                        equalizer: [],
                        timescale: {},
                        tremolo: {},
                        vibrato: {},
                        rotation: {},
                        karaoke: {}
                    }
                }
            });
            
            messages.success(message.channel, `🧹 All effects cleared!`);
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to clear effects!');
        }
    }
};
