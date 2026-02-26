const messages = require('../utils/messages.js');
const applyFilters = require('../utils/applyFilters');
const detectFilters = require('../utils/detectFilters');
const { detectLanguage, filterByLanguage } = require('../utils/languageDetector.js');

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

            // canonicalize YouTube URLs (including youtu.be short links).
            // Lavalink sometimes returns NO_MATCHES for the short form, so convert
            // to the standard watch URL and, if necessary, fall back to a search.
            let searchQuery = query;
            const ytMatch = query.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|v\/))([A-Za-z0-9_-]{11})/);
            if (ytMatch) {
                searchQuery = `https://www.youtube.com/watch?v=${ytMatch[1]}`;
            }

            let resolve = await client.riffy.resolve({
                query: searchQuery,
                requester: message.author,
            });

            // try again with a search by ID if the direct URL failed
            if ((resolve.loadType === "empty" || resolve.loadType === "NO_MATCHES") && ytMatch) {
                console.log(`⚠️ play.js: direct YouTube URL failed, falling back to search for '${ytMatch[1]}'`);
                resolve = await client.riffy.resolve({
                    query: `ytmsearch:${ytMatch[1]}`,
                    requester: message.author,
                });
            }

            // if the resolution returns a Spotify track/playlist but the user didn't
            // provide a Spotify URL we assume they wanted YouTube instead. this can
            // happen when the defaultSearchPlatform or lavalink plugin returns
            // Spotify results first. perform a second resolve forcing YouTube search.
            const isSpotifyUrl = /^https?:\/\/(open\.)?spotify\.com/.test(query);
            if (!isSpotifyUrl) {
                const firstTrack = resolve.tracks && resolve.tracks[0];
                if (
                    firstTrack &&
                    firstTrack.info &&
                    firstTrack.info.sourceName === 'spotify' &&
                    resolve.loadType !== 'playlist'
                ) {
                    console.log(`⚠️ play.js: spotify result detected for '${query}', retrying search on YouTube`);
                    // try again with a YouTube Music search prefix
                    resolve = await client.riffy.resolve({
                        query: `ytmsearch:${query}`,
                        requester: message.author,
                    });
                }
                // also handle case where a spotify playlist was returned but user
                // wanted YouTube; fallback by treating the query as a search term
                if (
                    resolve.loadType === 'playlist' &&
                    resolve.tracks.length > 0 &&
                    resolve.tracks[0].info.sourceName === 'spotify'
                ) {
                    console.log(`⚠️ play.js: spotify playlist detected for '${query}', retrying search on YouTube`);
                    resolve = await client.riffy.resolve({
                        query: `ytmsearch:${query}`,
                        requester: message.author,
                    });
                }
            }

            const { loadType, tracks, playlistInfo } = resolve;

            // Detect language from search query and filter results (for search/single track only)
            const detectedLang = detectLanguage(query);
            let filteredTracks = tracks;
            
            if ((loadType === "search" || loadType === "track") && tracks.length > 0) {
                filteredTracks = filterByLanguage(tracks, detectedLang, query);
                
                if (filteredTracks.length === 0) {
                    // Fallback to original results if filtering removed everything
                    filteredTracks = tracks;
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

                const track = filteredTracks.shift();
                track.info.requester = message.author;

                const isFirstTrack = player.queue.length === 0 && !player.playing;
                const position = player.queue.length + 1;

                player.queue.add(track);

                if (isFirstTrack) {
                    if (!player.playing && !player.paused) {
                        player.play();
                    }

                    // Now Playing is handled by trackStart event in index.js
                    // messages.nowPlaying(message.channel, track, player);

                } else {
                    messages.addedTrack(message.channel, track, position);
                }

            } else {
                return messages.error(message.channel, "No results found! Try with a different search term.");
            }

        } catch (error) {
            console.error(error);
        }
    }
};