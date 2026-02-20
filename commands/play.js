const messages = require('../utils/messages.js');

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Play a song or playlist',
    usage: 'fplay <query>',
    execute: async (message, args, client) => {
        const query = args.join(" ");
        if (!query) return messages.error(message.channel, "Please provide a search query!");

        try {
            const player = client.riffy.createConnection({
                guildId: message.guild.id,
                voiceChannel: message.member.voice.channel.id,
                textChannel: message.channel.id,
                deaf: true,
            });
            // Ensure sensible defaults: no autoplay and no queue loop by default
            try { player.autoplay = false; player.setLoop("none"); } catch(e) {/* ignore if not supported */}

            const resolve = await client.riffy.resolve({
                query: query,
                requester: message.author,
            });

            const { loadType, tracks, playlistInfo } = resolve;

            if (loadType === "playlist") {
                for (const track of resolve.tracks) {
                    track.info.requester = message.author;
                    player.queue.add(track);
                }

                messages.addedPlaylist(message.channel, playlistInfo, tracks);
                if (!player.playing && !player.paused) return player.play();
            } else if (loadType === "search" || loadType === "track") {
                const track = tracks.shift();
                track.info.requester = message.author;
                const position = player.queue.length + 1;
                player.queue.add(track);
                
                if (!player.playing && !player.paused) {
                    player.play();
                }
                // Track added silently - shown in now playing up next preview
            } else {
                return messages.error(message.channel, "No results found! Try with a different search term.");
            }
        } catch (error) {
            console.error(error);
            // Silently fail - now playing message will show the current track
        }
    }
};
