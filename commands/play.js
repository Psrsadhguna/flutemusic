const messages = require('../utils/messages.js');
const applyFilters = require('../utils/applyFilters');
const detectFilters = require('../utils/detectFilters');

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Play a song or playlist',
    usage: 'fplay <query>',
    execute: async (message, args, client) => {

        const query = args.join(" ");
        if (!query) return messages.error(message.channel, "Please provide a search query!");

        if (!message.member.voice.channel) {
            return messages.error(message.channel, "You must be connected to a voice channel to play music!");
        }

        try {
            const player = client.riffy.createConnection({
                guildId: message.guild.id,
                voiceChannel: message.member.voice.channel.id,
                textChannel: message.channel.id,
                deaf: true,
            });

            try { 
                player.autoplay = false; 
                player.setLoop("none"); 
            } catch (e) {}

            try { 
                player.twentyFourSeven = Boolean(
                    global.stats &&
                    global.stats.twentyFourSevenServers &&
                    global.stats.twentyFourSevenServers.has(message.guild.id)
                ); 
            } catch (e) { 
                player.twentyFourSeven = false; 
            }

            // Fast search - use YouTube Music search with simple query
            let resolve = await client.riffy.resolve({
                query: `ytmsearch:${query}`,
                requester: message.author,
            });

            let { loadType, tracks, playlistInfo } = resolve;

            // if the first result does not look like the query, retry using plain YouTube search
            if ((loadType === 'search' || loadType === 'track') && tracks && tracks.length > 0) {
                const firstTitle = (tracks[0].info.title || '').toLowerCase();
                const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
                const allWords = queryWords.every(w => firstTitle.includes(w));
                if (!allWords) {
                    // fallback to regular YouTube search for better relevance
                    resolve = await client.riffy.resolve({
                        query: `ytsearch:${query}`,
                        requester: message.author,
                    });
                    loadType = resolve.loadType;
                    tracks = resolve.tracks;
                    playlistInfo = resolve.playlistInfo;
                }
            }

            // ===============================
            // PLAYLIST
            // ===============================
            if (loadType === "playlist") {

                for (const track of tracks) {
                    track.info.requester = message.author;
                    player.queue.add(track);
                }

                messages.addedPlaylist(message.channel, playlistInfo, tracks);

                if (!player.playing && !player.paused) {
                    player.play();
                }

            }
            // ===============================
            // SINGLE TRACK
            // ===============================
            else if (loadType === "search" || loadType === "track") {

                if (tracks.length === 0) {
                    return messages.error(message.channel, "No results found! Try with a different search term.");
                }

                const track = tracks[0];
                track.info.requester = message.author;

                const isFirstTrack = player.queue.length === 0 && !player.playing;
                const position = player.queue.length + 1;

                player.queue.add(track);

                if (isFirstTrack) {
                    if (!player.playing && !player.paused) {
                        player.play();
                    }
                } else {
                    messages.addedTrack(message.channel, track, position);
                }

            } else {
                return messages.error(message.channel, "No results found! Try with a different search term.");
            }

        } catch (error) {
            console.error(error);
            messages.error(message.channel, "An error occurred while playing the song!");
        }
    }
};