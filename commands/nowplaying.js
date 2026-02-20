const messages = require('../utils/messages.js');

module.exports = {
    name: 'nowplaying',
    aliases: ['np'],
    description: 'Show current track info',
    usage: 'fnowplaying',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "Nothing is playing!");
        if (!player.queue.current) return messages.error(message.channel, "No track is currently playing!");

        messages.nowPlaying(message.channel, player.queue.current);
    }
};
