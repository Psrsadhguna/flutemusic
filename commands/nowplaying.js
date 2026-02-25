const messages = require('../utils/messages.js');

module.exports = {
    name: 'nowplaying',
    aliases: ['np'],
    description: 'Show current track info',
    usage: 'fnp',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "Nothing is playing!");
        
        // Get current track with fallbacks
        let currentTrack = null;
        if (player && player.queue && player.queue.current) {
            currentTrack = player.queue.current;
        } else if (player && player.current) {
            currentTrack = player.current;
        } else if (player && player.nowPlaying) {
            currentTrack = player.nowPlaying;
        }
        
        if (!currentTrack) return messages.error(message.channel, "No track is currently playing!");

        messages.nowPlaying(message.channel, currentTrack, player, client);
    }
};
