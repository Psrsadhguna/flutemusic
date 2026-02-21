const messages = require('../utils/messages.js');

module.exports = {
    name: 'nowplaying',
    aliases: ['np'],
    description: 'Show current track info',
    usage: 'fnowplaying',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");
        
        // Check multiple ways to get current track
        let currentTrack = null;
        
        // Try different properties where the current track might be stored
        if (player.queue && player.queue.current) {
            currentTrack = player.queue.current;
        } else if (player.queue && player.queue[0]) {
            currentTrack = player.queue[0];
        } else if (player.current) {
            currentTrack = player.current;
        } else if (player.nowPlaying) {
            currentTrack = player.nowPlaying;
        }
        
        if (!currentTrack || !currentTrack.info) {
            return messages.error(message.channel, "❌ No track is currently playing!");
        }

        messages.nowPlaying(message.channel, currentTrack, player);
    }
};
