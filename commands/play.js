const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const messages = require('../utils/messages.js');

const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const SEARCH_SOURCES = ['ytmsearch', 'ytsearch'];
const SPOTIFY_TRACK_REGEX = /https?:\/\/(?:open\.)?spotify\.com\/track\//i;
const FILTER_KEYWORDS = [
    'ringtone',
    'notification sound',
    'alert sound',
    'alarm',
    'no music',
    'shorts'
];
const ALT_VERSION_KEYWORDS = [
    'slowed',
    'reverb',
    'nightcore',
    'sped up',
    '8d',
    'karaoke',
    'instrumental',
    'cover',
    'live',
    'remix'
];

function clean(str = '') {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncate(text = '', max = 100) {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}

function isURL(value) {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

function hasAny(text, list) {
    return list.some((word) => text.includes(word));
}

function formatDuration(ms) {
    const value = Number(ms) || 0;
    if (value <= 0) return '0:00';
    const seconds = Math.floor((value / 1000) % 60);
    const minutes = Math.floor((value / (1000 * 60)) % 60);
    const hours = Math.floor(value / (1000 * 60 * 60));

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getCache(cacheKey) {
    const cached = searchCache.get(cacheKey);
    if (!cached) return null;

    if (cached.expiresAt < Date.now()) {
        searchCache.delete(cacheKey);
        return null;
    }

    return cached.value;
}

function setCache(cacheKey, value) {
    searchCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS
    });
}

function getTrackFingerprint(track) {
    if (!track || !track.info) return '';

    const identifier = (track.info.identifier || '').toLowerCase();
    if (identifier) return `id:${identifier}`;

    const uri = (track.info.uri || '').toLowerCase();
    if (uri) return `uri:${uri}`;

    return `meta:${clean(track.info.title || '')}:${clean(track.info.author || '')}`;
}

function sameTrack(a, b) {
    if (!a || !b) return false;
    return getTrackFingerprint(a) === getTrackFingerprint(b);
}

function getCurrentTrack(player) {
    if (!player) return null;
    if (player.queue && player.queue.current) return player.queue.current;
    if (player.current) return player.current;
    if (player.nowPlaying) return player.nowPlaying;
    return null;
}

function isDuplicateTrack(player, candidate) {
    const current = getCurrentTrack(player);
    if (current && sameTrack(current, candidate)) return true;

    if (!player || !player.queue || player.queue.length === 0) return false;
    return player.queue.some((queuedTrack) => sameTrack(queuedTrack, candidate));
}

function rankTracks(tracks, query) {
    if (!tracks?.length) return [];

    const cleanQuery = clean(query);
    const queryWords = cleanQuery.split(' ').filter((word) => word.length > 1);
    const userAskedForAlt = hasAny(cleanQuery, ALT_VERSION_KEYWORDS);

    const filtered = tracks.filter((track) => {
        const title = (track.info?.title || '').toLowerCase();
        const durationSec = Number(track.info?.length || 0) / 1000;

        if (durationSec > 0 && durationSec < 45) return false;
        if (hasAny(title, FILTER_KEYWORDS)) return false;

        return true;
    });

    const usableTracks = filtered.length ? filtered : tracks;

    const scored = usableTracks.map((track) => {
        const titleRaw = track.info?.title || '';
        const title = clean(titleRaw);
        const author = clean(track.info?.author || '');
        const durationSec = Number(track.info?.length || 0) / 1000;

        let score = 0;

        if (title.includes(cleanQuery)) score += 60;

        let titleMatches = 0;
        for (const word of queryWords) {
            if (title.includes(word)) titleMatches += 1;
            else if (author.includes(word)) score += 4;
        }

        score += titleMatches * 10;
        if (queryWords.length > 0 && titleMatches === queryWords.length) score += 25;

        if (
            title.includes('official') ||
            title.includes('audio') ||
            title.includes('video') ||
            author.includes('vevo') ||
            author.includes('topic')
        ) {
            score += 12;
        }

        if (!userAskedForAlt && hasAny(title, ALT_VERSION_KEYWORDS)) {
            score -= 22;
        }

        if (durationSec >= 120 && durationSec <= 420) score += 10;
        if (durationSec > 1800) score -= 8;

        return { track, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored;
}

function pickBestTrack(tracks, query) {
    return rankTracks(tracks, query)[0]?.track || null;
}

function splitMeaningfulWords(text) {
    return clean(text).split(' ').filter((word) => word.length > 2);
}

function durationMatches(expectedMs, actualMs) {
    const expected = Number(expectedMs) || 0;
    const actual = Number(actualMs) || 0;
    if (!expected || !actual) return true;

    const diff = Math.abs(expected - actual);
    const tolerance = Math.max(15000, Math.min(45000, Math.floor(expected * 0.12)));
    return diff <= tolerance;
}

function scoreSpotifyCandidate(spotifyTrack, candidate) {
    const spotifyTitle = clean(spotifyTrack?.info?.title || '');
    const spotifyAuthor = clean(spotifyTrack?.info?.author || '');
    const candidateTitle = clean(candidate?.info?.title || '');
    const candidateAuthor = clean(candidate?.info?.author || '');

    if (!spotifyTitle || !candidateTitle) return Number.NEGATIVE_INFINITY;

    const titleWords = splitMeaningfulWords(spotifyTitle);
    const titleHits = titleWords.filter((word) => candidateTitle.includes(word)).length;
    const titleCoverage = titleWords.length ? (titleHits / titleWords.length) : 0;

    const artistWords = splitMeaningfulWords(spotifyAuthor).slice(0, 5);
    const artistHits = artistWords.filter(
        (word) => candidateAuthor.includes(word) || candidateTitle.includes(word)
    ).length;

    let score = 0;
    score += titleCoverage * 110;
    score += artistHits * 18;

    if (candidateTitle.includes(spotifyTitle) || spotifyTitle.includes(candidateTitle)) {
        score += 35;
    }

    if (artistWords.length > 0 && artistHits === 0) {
        score -= 70;
    }

    if (!durationMatches(spotifyTrack?.info?.length, candidate?.info?.length)) {
        score -= 65;
    }

    const candidateTitleLower = (candidate?.info?.title || '').toLowerCase();
    const spotifyTitleLower = (spotifyTrack?.info?.title || '').toLowerCase();

    if (hasAny(candidateTitleLower, ALT_VERSION_KEYWORDS) && !hasAny(spotifyTitleLower, ALT_VERSION_KEYWORDS)) {
        score -= 35;
    }

    if (
        candidateTitleLower.includes('official') ||
        candidateTitleLower.includes('audio') ||
        candidateAuthor.includes('topic')
    ) {
        score += 10;
    }

    return score;
}

function pickSpotifyMappedTrack(spotifyTrack, candidates) {
    if (!spotifyTrack || !Array.isArray(candidates) || candidates.length === 0) return null;

    const scored = candidates
        .map((track) => ({ track, score: scoreSpotifyCandidate(spotifyTrack, track) }))
        .filter((item) => Number.isFinite(item.score))
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;

    const best = scored[0];
    return best.track;
}

async function resolveSafe(client, options) {
    try {
        return await client.riffy.resolve(options);
    } catch (error) {
        return {
            loadType: 'error',
            exception: { message: error?.message || 'Unknown resolve error' },
            playlistInfo: null,
            pluginInfo: {},
            tracks: []
        };
    }
}

async function resolveWithFallback(client, query, requester) {
    const cacheKey = query.toLowerCase();
    const cached = getCache(cacheKey);
    if (cached) return cached;

    let rankingQuery = query;
    let resolve = null;

    if (SPOTIFY_TRACK_REGEX.test(query)) {
        const spotifyResolve = await resolveSafe(client, { query, requester });
        const spotifyTrack = spotifyResolve?.tracks?.[0] || null;

        if (spotifyTrack) {
            const mappedQuery = [spotifyTrack.info?.title, spotifyTrack.info?.author, 'official audio']
                .filter(Boolean)
                .join(' ')
                .trim();

            if (mappedQuery) {
                rankingQuery = mappedQuery;
                const mappedCandidates = [];
                const seen = new Set();

                for (const source of SEARCH_SOURCES) {
                    const sourceResolve = await resolveSafe(client, {
                        query: mappedQuery,
                        source,
                        requester
                    });

                    if (!resolve && sourceResolve?.tracks?.length) {
                        resolve = sourceResolve;
                    }

                    if (!sourceResolve?.tracks?.length) continue;

                    for (const track of sourceResolve.tracks.slice(0, 10)) {
                        const fp = getTrackFingerprint(track);
                        if (!fp || seen.has(fp)) continue;
                        seen.add(fp);
                        mappedCandidates.push(track);
                    }
                }

                const bestMappedTrack = pickSpotifyMappedTrack(spotifyTrack, mappedCandidates);
                if (bestMappedTrack) {
                    resolve = {
                        loadType: 'track',
                        tracks: [bestMappedTrack],
                        playlistInfo: null,
                        pluginInfo: {}
                    };
                }
            }
        }

        if (!resolve) resolve = spotifyResolve;
    } else if (isURL(query)) {
        resolve = await resolveSafe(client, { query, requester });
    } else {
        for (const source of SEARCH_SOURCES) {
            const attempt = await resolveSafe(client, { query, source, requester });
            if (!resolve) resolve = attempt;

            if (attempt?.loadType !== 'error' && attempt?.tracks?.length) {
                resolve = attempt;
                break;
            }
        }
    }

    const result = { resolve, rankingQuery };

    if (resolve?.tracks?.length) {
        setCache(cacheKey, result);
    }

    return result;
}

function ensurePlayer(client, message) {
    const guildId = message.guild.id;
    const voiceChannelId = message.member.voice.channel.id;
    const textChannelId = message.channel.id;

    let player = client.riffy.players.get(guildId);

    if (!player) {
        return client.riffy.createConnection({
            guildId,
            voiceChannel: voiceChannelId,
            textChannel: textChannelId,
            deaf: true
        });
    }

    if (player.voiceChannel !== voiceChannelId) {
        try {
            player.setVoiceChannel(voiceChannelId, { deaf: true, mute: false });
        } catch {
            player.connect({
                guildId,
                voiceChannel: voiceChannelId,
                deaf: true,
                mute: false
            });
        }
    } else if (!player.connected) {
        player.connect({
            guildId,
            voiceChannel: voiceChannelId,
            deaf: true,
            mute: false
        });
    }

    if (player.textChannel !== textChannelId && typeof player.setTextChannel === 'function') {
        player.setTextChannel(textChannelId);
    }

    return player;
}

async function requestTrackSelection(message, rankedTracks, displayQuery) {
    const topCandidates = rankedTracks.slice(0, 5).map((item) => item.track);
    if (topCandidates.length === 0) return null;
    if (topCandidates.length === 1) return topCandidates[0];

    const customId = `play_pick_${message.id}_${Date.now().toString(36)}`;
    const options = topCandidates.map((track, index) => {
        const title = truncate(track.info?.title || 'Unknown', 100);
        const author = truncate(track.info?.author || 'Unknown', 60);
        const duration = formatDuration(track.info?.length || 0);

        return {
            label: title,
            description: truncate(`${author} | ${duration}`, 100),
            value: String(index)
        };
    });

    const menu = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder('Select the correct song (20 seconds)')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);

    const promptEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Pick the song')
        .setDescription(`Search: **${truncate(displayQuery, 120)}**\nChoose one result from top ${topCandidates.length}.`)
        .setTimestamp();

    const promptMessage = await message.channel.send({
        embeds: [promptEmbed],
        components: [row]
    }).catch(() => null);

    if (!promptMessage) {
        return topCandidates[0];
    }

    try {
        const interaction = await promptMessage.awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 20000,
            filter: (i) => i.customId === customId && i.user.id === message.author.id
        });

        const chosenIndex = Number(interaction.values?.[0]);
        const selectedTrack = topCandidates[Number.isInteger(chosenIndex) ? chosenIndex : 0] || topCandidates[0];

        await interaction.deferUpdate().catch(() => {});
        await promptMessage.delete().catch(() => {});

        return selectedTrack;
    } catch {
        await promptMessage.edit({ components: [] }).catch(() => {});
        await messages.error(message.channel, 'Song selection timed out. Use play again.').catch(() => {});
        return null;
    }
}

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Play a song or playlist',
    usage: 'fplay <query>',

    execute: async (message, args, client) => {
        const query = args.join(' ').trim();

        if (!query) {
            return messages.error(message.channel, 'Provide a song name or link.');
        }

        if (!message.member.voice.channel) {
            return messages.error(message.channel, 'Join a voice channel first!');
        }

        try {
            const player = ensurePlayer(client, message);
            const { resolve, rankingQuery } = await resolveWithFallback(client, query, message.author);

            if (!resolve || resolve.loadType === 'error') {
                const reason = resolve?.exception?.message || 'Search failed on node';
                return messages.error(message.channel, `Search failed: ${reason}`);
            }

            const { loadType, tracks, playlistInfo } = resolve;

            if (!tracks?.length) {
                return messages.error(message.channel, 'No results found.');
            }

            const inputIsUrl = isURL(query);
            const spotifyTrackLink = SPOTIFY_TRACK_REGEX.test(query);

            if (loadType === 'playlist') {
                for (const track of tracks) {
                    track.info.requester = message.author;
                    track.info.autoplayEligible = !inputIsUrl;
                    player.queue.add(track);
                }

                if (!player.playing && !player.paused) {
                    await player.play();
                }

                return messages.addedPlaylist(message.channel, playlistInfo, tracks);
            }

            let selectedTrack = null;
            if (inputIsUrl) {
                if (spotifyTrackLink) {
                    selectedTrack = tracks[0];
                } else {
                    selectedTrack = tracks[0];
                }
            } else {
                const ranked = rankTracks(tracks, rankingQuery);

                if (!ranked.length) {
                    return messages.error(message.channel, 'No suitable match found.');
                }

                if (ranked.length > 1) {
                    selectedTrack = await requestTrackSelection(message, ranked, rankingQuery);
                } else {
                    selectedTrack = ranked[0].track;
                }
            }

            if (!selectedTrack) {
                return;
            }

            if (isDuplicateTrack(player, selectedTrack)) {
                return messages.error(message.channel, 'This song is already playing or already in queue.');
            }

            selectedTrack.info.requester = message.author;
            selectedTrack.info.autoplayEligible = !inputIsUrl;
            const queuePosition = player.queue.length + 1;
            const shouldStartNow = !player.playing && !player.paused;
            const addedAt = Date.now();

            player.queue.add(selectedTrack);

            if (shouldStartNow) {
                await player.play();
                return;
            }

            return messages.addedTrack(message.channel, selectedTrack, queuePosition, {
                addedAt,
                deleteAfterMs: 15000
            });
        } catch (error) {
            console.error('Play Command Error:', error);
            return messages.error(message.channel, 'Failed to play song.');
        }
    }
};
