const messages = require('../utils/messages.js');
const applyFilters = require('../utils/applyFilters');
const detectFilters = require('../utils/detectFilters');

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Play a song or playlist',
    usage: 'fplay <query>',

    execute: async (message, args, client) => {

        const query = args.join(" ").trim();
        if (!query)
            return messages.error(message.channel, "Please provide a search query!");

        if (!message.member.voice.channel)
            return messages.error(message.channel, "You must be connected to a voice channel to play music!");

        // ----------------------------
        // URL CHECKER
        // ----------------------------
        const isURL = (str) => {
            try {
                new URL(str);
                return true;
            } catch {
                return false;
            }
        };

        try {

            // =============================
            // CREATE PLAYER CONNECTION
            // =============================
            const player = client.riffy.createConnection({
                guildId: message.guild.id,
                voiceChannel: message.member.voice.channel.id,
                textChannel: message.channel.id,
                deaf: true,
            });

            // Safe settings
            try {
                player.autoplay = false;
                player.setLoop("none");
            } catch {}

            try {
                player.twentyFourSeven = Boolean(
                    global.stats &&
                    global.stats.twentyFourSevenServers &&
                    global.stats.twentyFourSevenServers.has(message.guild.id)
                );
            } catch {
                player.twentyFourSeven = false;
            }

            // =============================
            // SMART RESOLVE SYSTEM (FIXED)
            // =============================
            let resolve;

<<<<<<< HEAD
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
=======
            // 🎵 SPOTIFY LINK
            if (query.includes("open.spotify.com")) {

                resolve = await client.riffy.resolve({
                    query: query,
                    requester: message.author,
                });

            }

            // ▶️ YOUTUBE DIRECT LINK (IMPORTANT FIX)
            else if (
                query.includes("youtube.com") ||
                query.includes("youtu.be")
            ) {

                // DIRECT LOAD — NO SEARCH PREFIX
                resolve = await client.riffy.resolve({
                    query: query,
                    requester: message.author,
                });

            }

            // 🌐 OTHER URL
            else if (isURL(query)) {

                resolve = await client.riffy.resolve({
                    query: query,
                    requester: message.author,
                });

            }

            // 🔎 NORMAL SEARCH
            else {

                resolve = await client.riffy.resolve({
                    query: `ytmsearch:${query}`,
                    requester: message.author,
                });

            }

            // =============================
            // RESULT HANDLING
            // =============================
            const { loadType, tracks, playlistInfo } = resolve;
>>>>>>> 75c326fd682c3461c5459fb60a2738d930ebe14b

            // ---------- PLAYLIST ----------
            if (loadType === "playlist") {

                for (const track of tracks) {
                    track.info.requester = message.author;
                    player.queue.add(track);
                }

                messages.addedPlaylist(message.channel, playlistInfo, tracks);

                if (!player.playing && !player.paused)
                    player.play();
            }

            // ---------- SINGLE TRACK ----------
            else if (loadType === "search" || loadType === "track") {

                if (!tracks.length)
                    return messages.error(message.channel, "No results found!");

                const track = tracks[0];
                track.info.requester = message.author;

                const isFirstTrack =
                    player.queue.length === 0 && !player.playing;

                const position = player.queue.length + 1;

                player.queue.add(track);

                if (isFirstTrack) {
                    if (!player.playing && !player.paused)
                        player.play();
                } else {
                    messages.addedTrack(message.channel, track, position);
                }
            }

            // ---------- ERROR ----------
            else {
                return messages.error(
                    message.channel,
                    "No results found! Try a different search."
                );
            }

        } catch (error) {
            console.error("Play Command Error:", error);
            messages.error(
                message.channel,
                "An error occurred while playing the song!"
            );
        }
    }
};