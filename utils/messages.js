const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const emojis = require('../emojis.js');
const config = require('../config.js');
const buttonUtils = require('./buttons.js');

// Spotify API helper
const getSpotifyRecommendations = async (trackTitle, artistName) => {
    try {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
            console.log('Spotify credentials not available');
            return null;
        }

        // Get access token
        const authResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
            },
            body: 'grant_type=client_credentials'
        });

        if (!authResponse.ok) {
            console.log('Spotify auth failed');
            return null;
        }

        const authData = await authResponse.json();
        const accessToken = authData.access_token;

        // Search for track on Spotify
        const searchResponse = await fetch(`https://api.spotify.com/v1/search?q=track:${encodeURIComponent(trackTitle)}+artist:${encodeURIComponent(artistName)}&type=track&limit=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!searchResponse.ok) return null;

        const searchData = await searchResponse.json();
        const tracks = searchData.tracks?.items;

        if (!tracks || tracks.length === 0) {
            console.log('Track not found on Spotify');
            return null;
        }

        const spotifyTrackId = tracks[0].id;

        // Get recommendations - returns completely DIFFERENT songs (fetch 10 for variety)
        const recResponse = await fetch(`https://api.spotify.com/v1/recommendations?seed_tracks=${spotifyTrackId}&limit=10&market=US`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!recResponse.ok) return null;

        const recData = await recResponse.json();
        // Return ONLY song names, no artist info to avoid duplicates
        return recData.tracks?.map(t => t.name) || null;

    } catch (e) {
        console.error('Spotify recommendations error:', e.message);
        return null;
    }
};

// YouTube recommendations helper - generate pragmatic search queries
const getYouTubeRecommendations = async (trackTitle, artistName) => {
    try {
        const normalize = (s) => (s || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
        const titleNorm = normalize(trackTitle);
        const artistNorm = normalize(artistName);
        const artistShort = ((artistName || '').split(/&|,|feat|ft| and /i)[0] || '').trim();

        // Filter only compilation/remix indicators, not genre names
        const compilationBanned = ['remix', 'mix', 'playlist', 'megamix', 'mashup', 'compilation', 'medley'];
        const containsBanned = (s = '') => compilationBanned.some(b => (s || '').toLowerCase().includes(b));

        const suggestions = [];

        if (trackTitle && trackTitle.length > 1 && !containsBanned(trackTitle)) {
            suggestions.push(`${trackTitle} similar songs`);
            suggestions.push(`${trackTitle} soundtrack`);
        }

        const lang = detectLanguage(trackTitle || '', artistName || '');
        if (lang && lang.toLowerCase().includes('telugu')) {
            if (trackTitle) suggestions.push(`${trackTitle} telugu songs`);
            if (artistShort) suggestions.push(`${artistShort} telugu songs`);
        }

        if (artistShort && !titleNorm) {
            suggestions.push(`${artistShort} movie songs`);
            suggestions.push(`${artistShort} hero songs`);
            suggestions.push(`${artistShort} top songs`);
            suggestions.push(`${artistShort} songs`);
        }

        if (trackTitle && artistShort) {
            suggestions.push(`${trackTitle} ${artistShort} songs`);
            suggestions.push(`${artistShort} ${trackTitle}`);
        }

        suggestions.push('telugu movie songs');
        suggestions.push('telugu hit songs');

        const seen = new Set();
        const results = [];
        for (const s of suggestions) {
            if (results.length >= 5) break;
            if (!s || typeof s !== 'string') continue;
            const n = normalize(s);
            if (!n) continue;
            if (containsBanned(n)) continue;
            if (titleNorm && titleNorm.length > 0 && n.includes(titleNorm)) continue;
            if (artistNorm && artistNorm.length > 0 && n.includes(artistNorm)) continue;
            if (seen.has(n)) continue;
            seen.add(n);
            results.push(s);
        }

        return results.slice(0, 5);
    } catch (e) {
        console.error('YouTube recommendations error:', e.message);
        return null;
    }
};

// URL validation function
function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (e) {
        return false;
    }
}

// Create help button
function createHelpButton() {
    const url = config.helpURL || '';
    if (url && isValidURL(url)) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Help')
                .setStyle(ButtonStyle.Link)
                .setURL(url)
        );
    }
    return null;
}

// Create help embed buttons (only valid URLs)
function createHelpButtons() {
    const components = [];
    
    // Support button
    if (config.supportURL && isValidURL(config.supportURL)) {
        components.push(
            new ButtonBuilder()
                .setLabel('Support')
                .setStyle(ButtonStyle.Link)
                .setURL(config.supportURL)
                .setEmoji('🔗')
        );
    }
    
    // Vote button
    if (config.voteURL && isValidURL(config.voteURL)) {
        components.push(
            new ButtonBuilder()
                .setLabel('Vote')
                .setStyle(ButtonStyle.Link)
                .setURL(config.voteURL)
                .setEmoji('⭐')
        );
    }
    
    // Website button
    if (config.websiteURL && isValidURL(config.websiteURL)) {
        components.push(
            new ButtonBuilder()
                .setLabel('Website')
                .setStyle(ButtonStyle.Link)
                .setURL(config.websiteURL)
                .setEmoji('🌐')
        );
    }
    
    // Only return a row if we have buttons
    if (components.length > 0) {
        return new ActionRowBuilder().addComponents(...components);
    }
    return null;
}

// Format duration in milliseconds to HH:MM:SS or MM:SS
const formatDuration = (ms) => {
    if (!ms || ms <= 0 || ms === 'Infinity') return '';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const getDurationString = (track) => {
    if (track.info.isStream) return '';
    if (!track.info.duration) return 'N/A';
    return formatDuration(track.info.duration);
};

// Detect language from title/author using heuristics
const detectLanguage = (title = '', author = '') => {
    const text = ((title || '') + ' ' + (author || '')).toLowerCase();
    
    // Detect by Unicode script blocks (most reliable)
    if (/[\u0900-\u097F]/.test(text)) return '🇮🇳 Hindi';
    if (/[\u0C00-\u0C7F]/.test(text)) return '🇮🇳 Telugu';
    if (/[\u0B80-\u0BFF]/.test(text)) return '🇮🇳 Tamil';
    if (/[\u0C80-\u0CFF]/.test(text)) return '🇮🇳 Kannada';
    if (/[\u0D00-\u0D7F]/.test(text)) return '🇮🇳 Malayalam';
    if (/[\u0A00-\u0A7F]/.test(text)) return '🇮🇳 Punjabi';
    if (/[\u0600-\u06FF]/.test(text)) return '🇵🇰 Urdu/Arabic';
    
    // Detect by keyword (case-insensitive)
    const langMap = [
        ['hindi', '🇮🇳 Hindi'],
        ['telugu', '🇮🇳 Telugu'],
        ['tamil', '🇮🇳 Tamil'],
        ['kannada', '🇮🇳 Kannada'],
        ['malayalam', '🇮🇳 Malayalam'],
        ['punjabi', '🇮🇳 Punjabi'],
        ['marathi', '🇮🇳 Marathi'],
        ['bengali', '🇧🇩 Bengali'],
        ['gujarati', '🇮🇳 Gujarati'],
        ['urdu', '🇵🇰 Urdu'],
        ['english', '🇬🇧 English'],
        ['spanish', '🇪🇸 Spanish'],
        ['portuguese', '🇵🇹 Portuguese'],
        ['french', '🇫🇷 French'],
        ['german', '🇩🇪 German'],
        ['italian', '🇮🇹 Italian'],
        ['russian', '🇷🇺 Russian'],
        ['japanese', '🇯🇵 Japanese'],
        ['korean', '🇰🇷 Korean'],
        ['chinese', '🇨🇳 Chinese'],
    ];
    
    for (const [keyword, flag] of langMap) {
        if (text.includes(keyword)) return flag;
    }
    
    return '';
};

// Base embed builder
const baseEmbed = (title, description = '') => {
    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTimestamp();
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    embed.setFooter({ text: '© flute music ' });
    return embed;
};

const successEmbed = (message) => {
    return new EmbedBuilder()
        .setColor('#00FF00')
        .setDescription(`${emojis.success} ${message}`)
        .setTimestamp();
};

const errorEmbed = (message) => {
    return new EmbedBuilder()
        .setColor('#FF0000')
        .setDescription(`${emojis.error} ${message}`)
        .setTimestamp();
};

// ====================================
// RECOMMENDATION ENGINE
// ====================================

const generateRecommendations = async (track, client) => {
    if (!track || !track.info) return [];

    try {
        const [spotifyRecs, youtubeRecs] = await Promise.all([
            getSpotifyRecommendations(
                track.info.title || 'Unknown',
                track.info.author || 'Unknown'
            ),
            getYouTubeRecommendations(
                track.info.title || 'Unknown',
                track.info.author || 'Unknown'
            )
        ]);

        const allRecs = [];
        const seenLabels = new Set();

        const normalizeKey = (s = '') => {
            let normalized = (s || '').toString().toLowerCase();
            // Remove remix, version, and similar suffixes
            normalized = normalized.replace(/\s*(remix|edit|version|feat|featuring|ft|ft\.|radio|live|acoustic|cover|mix|remaster|slowed|reverb)\s*/gi, ' ');
            normalized = normalized.replace(/\([^)]*\)/g, ' ');
            // Remove special characters but keep space structure
            normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');
            // Collapse multiple spaces and trim
            normalized = normalized.replace(/\s+/g, ' ').trim();
            return normalized;
        };

        const currentTitleNorm = normalizeKey(track?.info?.title || '');
        const currentAuthorNorm = normalizeKey(track?.info?.author || '');
        
        // Helper to check if a recommendation is similar to current track
        const isSimilarToCurrentTrack = (recNorm) => {
            if (!recNorm) return false;
            // Exact match
            if (recNorm === currentTitleNorm) return true;
            if (recNorm === currentAuthorNorm) return true;
            
            // Partial word match (prevent artist's other songs)
            if (currentAuthorNorm && currentAuthorNorm.length > 3) {
                if (recNorm.includes(currentAuthorNorm) || currentAuthorNorm.includes(recNorm)) return true;
            }
            
            // Check if most of the words match (70%+ overlap)
            const recWords = recNorm.split(' ').filter(w => w);
            const currentWords = currentTitleNorm.split(' ').filter(w => w);
            if (recWords.length > 0 && currentWords.length > 0) {
                const commonWords = recWords.filter(w => currentWords.includes(w));
                const overlapRatio = commonWords.length / Math.max(recWords.length, currentWords.length);
                if (overlapRatio > 0.7) return true;
            }
            
            return false;
        };
        
        const recentTitlesNorm = new Set();
        try {
            if (global.stats && Array.isArray(global.stats.recentlyPlayed)) {
                const recent5 = global.stats.recentlyPlayed.slice(-5);
                for (const r of recent5) {
                    recentTitlesNorm.add(normalizeKey(r.title || ''));
                }
            }
        } catch (e) {}

        // Get queue titles to avoid duplicates
        const queuedTitlesNorm = new Set();
        try {
            if (track && track.queue && Array.isArray(track.queue)) {
                for (const qTrack of track.queue) {
                    if (qTrack && qTrack.info && qTrack.info.title) {
                        queuedTitlesNorm.add(normalizeKey(qTrack.info.title));
                    }
                }
            }
        } catch (e) {}

        const recentlyRecommendedNorm = new Set();
        try {
            if (global.recentlyRecommended && Array.isArray(global.recentlyRecommended)) {
                const recentOnly = global.recentlyRecommended.slice(-3);
                for (const r of recentOnly) {
                    recentlyRecommendedNorm.add(normalizeKey(r || ''));
                }
            }
        } catch (e) {}

        // Filter only compilation/remix indicators, not genre names
        const compilationBanned = ['remix', 'mix', 'playlist', 'megamix', 'mashup', 'compilation', 'medley'];
        const containsBanned = (s = '') => compilationBanned.some(b => (s || '').toLowerCase().includes(b));

        const resolveWithTimeout = (query, ms = 1200) => {
            return new Promise(resolve => {
                let done = false;
                const timer = setTimeout(() => {
                    if (!done) { done = true; resolve(null); }
                }, ms);
                (async () => {
                    try {
                        if (!client || !client.riffy) { clearTimeout(timer); return resolve(null); }
                        const res = await client.riffy.resolve({ query, requester: track.info.requester || undefined }).catch(() => null);
                        if (!done) {
                            done = true;
                            clearTimeout(timer);
                            const t = res?.tracks?.[0];
                            if (t && t.info && t.info.title) return resolve({ title: t.info.title, query });
                            return resolve(null);
                        }
                    } catch (e) {
                        if (!done) { done = true; clearTimeout(timer); return resolve(null); }
                    }
                })();
            });
        };

        const candidates = [];
        if (spotifyRecs && Array.isArray(spotifyRecs)) {
            for (const r of spotifyRecs.slice(0, 15)) {
                if (!r || containsBanned(r)) continue;
                const n = normalizeKey(r);
                if (seenLabels.has(n)) continue;
                candidates.push(r);
                seenLabels.add(n);
            }
        }
        if (youtubeRecs && Array.isArray(youtubeRecs)) {
            for (const r of youtubeRecs) {
                if (!r || containsBanned(r)) continue;
                const n = normalizeKey(r);
                if (seenLabels.has(n)) continue;
                candidates.push(r);
                seenLabels.add(n);
            }
        }

        // Only use actual Spotify and YouTube song recommendations (no generic categories)
        // This prevents duplicate songs and ensures real song names only
        const promises = candidates.map(c => resolveWithTimeout(c, 1200));
        const settled = await Promise.allSettled(promises);

        for (let i = 0; i < settled.length && allRecs.length < 6; i++) {
            const res = settled[i];
            const cand = candidates[i];
            let label = null;
            let value = cand;
            if (res.status === 'fulfilled' && res.value && res.value.title) {
                label = res.value.title;
                value = res.value.query || cand;
            } else {
                label = cand;
                value = cand;
            }
            label = (label || '').substring(0, 80);
            const key = normalizeKey(label);
            if (!label) continue;

            // Additional check: filter out titles with banned words
            if (containsBanned(label)) continue;

            // Filter out currently playing song and similar tracks
            if (isSimilarToCurrentTrack(key)) continue;
            if (recentTitlesNorm.has(key)) continue;
            if (queuedTitlesNorm.has(key)) continue; // Skip songs already in queue
            if (global.recentlyRecommended && global.recentlyRecommended.length > 0) {
                const lastThree = global.recentlyRecommended.slice(-3);
                if (lastThree.some(r => normalizeKey(r || '') === key)) continue;
            }
            if (allRecs.find(ar => normalizeKey(ar.label) === key)) continue;

            const emoji = spotifyRecs && spotifyRecs.includes(cand) ? '🎵' : (youtubeRecs && youtubeRecs.includes(cand) ? '▶️' : '🙏');
            allRecs.push({ label, value, emoji });
        }

        if (allRecs.length > 6) allRecs.length = 6;

        if (allRecs.length > 0) {
            track.info.recommendations = allRecs;
            
            // Cache recommendations globally for exact playback
            if (!global.recommendationCache) global.recommendationCache = {};
            const cacheKey = `${track.info.identifier || track.info.title}_${Date.now()}`;
            global.recommendationCache[cacheKey] = {
                recs: allRecs,
                timestamp: Date.now(),
                trackIdentifier: track.info.identifier || track.info.title
            };
            track.info.recommendationCacheKey = cacheKey;
            
            if (!global.recentlyRecommended) global.recentlyRecommended = [];
            for (const rec of allRecs) {
                const recKey = normalizeKey(rec.label);
                if (!global.recentlyRecommended.find(r => normalizeKey(r) === recKey)) {
                    global.recentlyRecommended.push(rec.label);
                }
            }
            if (global.recentlyRecommended.length > 20) {
                global.recentlyRecommended = global.recentlyRecommended.slice(-20);
            }
            console.log(`✅ Loaded ${allRecs.length} recommendations`);
        }

        return allRecs;
    } catch (err) {
        console.log('Failed to generate recommendations:', err.message);
        return [];
    }
};

// Main module exports
module.exports = {
    // Basic Messages
    success: (channel, message) => {
        return channel.send({ embeds: [successEmbed(message)] });
    },

    error: (channel, message) => {
        return channel.send({ embeds: [errorEmbed(message)] });
    },

    info: (channel, title, description) => {
        return channel.send({ embeds: [baseEmbed(`${emojis.info} ${title}`, description)] });
    },

    // Music Player Messages
    nowPlaying: (channel, track, player) => {
        try {
            if (!track || !track.info) {
                return channel.send({ content: '❌ No valid track information available' });
            }

            track.info.recommendations = [];

            const createProgressBar = (position, length, isStream) => {
                if (!position || !length || isStream) return '';
                
                const barLength = 15;
                const filledLength = Math.round((position / length) * barLength);
                const emptyLength = barLength - filledLength;
                
                const filled = '🟩'.repeat(filledLength);
                const empty = '🟥'.repeat(emptyLength);
                const percentage = Math.round((position / length) * 100);
                
                return `${filled}${empty} **${percentage}%**`;
            };

            const buildEmbed = (position, currentTrack) => {
                try {
                    const trackToUse = currentTrack || track;
                    
                    const embed = new EmbedBuilder()
                        .setColor(config.embedColor)
                        .setTitle(`${emojis.playing} Now Playing`)
                        .setTimestamp();
                    
                    const trackTitle = (trackToUse.info.title || 'Unknown').substring(0, 256);
                    const trackUrl = trackToUse.info.uri || '';
                    let description = `**${trackTitle}**`;
                    if (trackUrl && trackUrl.startsWith('http')) {
                        description = `**[${trackTitle}](${trackUrl})**`;
                    }
                    embed.setDescription(description);

                    let thumbnail = null;
                    
                    if (typeof trackToUse.info.thumbnail === 'string' && trackToUse.info.thumbnail.trim()) {
                        thumbnail = trackToUse.info.thumbnail;
                    } else if (typeof trackToUse.info.artworkUrl === 'string' && trackToUse.info.artworkUrl.trim()) {
                        thumbnail = trackToUse.info.artworkUrl;
                    } else if (typeof trackToUse.info.image === 'string' && trackToUse.info.image.trim()) {
                        thumbnail = trackToUse.info.image;
                    }
                    
                    if (!thumbnail && trackToUse.info.uri) {
                        try {
                            const uri = trackToUse.info.uri;
                            let videoId = null;
                            
                            if (uri.includes('v=')) {
                                const startIdx = uri.indexOf('v=') + 2;
                                videoId = uri.substring(startIdx, startIdx + 11);
                            } else if (uri.includes('youtu.be/')) {
                                const startIdx = uri.indexOf('youtu.be/') + 9;
                                videoId = uri.substring(startIdx, startIdx + 11);
                            }
                            
                            if (videoId && videoId.length === 11) {
                                thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
                            }
                        } catch (e) {
                            console.error('Exception during video ID extraction:', e.message);
                        }
                    }
                    
                    if (thumbnail && typeof thumbnail === 'string' && thumbnail.trim()) {
                        try {
                            embed.setThumbnail(thumbnail);
                        } catch (e) {
                            console.error('Failed to set thumbnail:', e.message);
                        }
                    }

                    if (trackToUse.info.requester && trackToUse.info.requester.tag) {
                        embed.setAuthor({ name: `Requested by ${trackToUse.info.requester.tag}` });
                    }

                    const artist = (trackToUse.info.author || 'Unknown').substring(0, 1024);
                    const source = (trackToUse.info.sourceName || 'Unknown').substring(0, 1024);
                    
                    embed.addFields([
                        { name: '🎤 Artist', value: artist, inline: false },
                        { name: '🔗 Source', value: source, inline: false }
                    ]);

                    const duration = formatDuration(trackToUse.info.length) || 'N/A';
                    if (player && typeof player.position === 'number') {
                        const currentTime = formatDuration(position) || '0:00';
                        const progressBar = createProgressBar(position, trackToUse.info.length, trackToUse.info.isStream);
                        const durationText = progressBar ? `${currentTime} / ${duration}\n${progressBar}` : `${currentTime} / ${duration}`;
                        embed.addFields([
                            { name: '⏱️ Duration', value: durationText, inline: false }
                        ]);
                    } else {
                        embed.addFields([
                            { name: '⏱️ Duration', value: duration, inline: false }
                        ]);
                    }

                    if (player && player.queue && Array.isArray(player.queue) && player.queue.length > 0) {
                        try {
                            const upNext = [];
                            for (let i = 0; i < Math.min(3, player.queue.length); i++) {
                                const t = player.queue[i];
                                if (t && t.info && t.info.title) {
                                    const title = t.info.title.substring(0, 40);
                                    upNext.push(`• ${title}`);
                                }
                            }
                            if (upNext.length > 0) {
                                const queueText = upNext.join('\n');
                                embed.addFields([
                                    { name: '📑 Up Next', value: queueText || 'No more tracks', inline: false }
                                ]);
                            }
                        } catch (e) {
                            // Silently skip queue preview if it fails
                        }
                    }

                    embed.setFooter({ text: '© flute music team' });
                    return embed;
                } catch (err) {
                    console.error('Error building embed:', err.message);
                    throw err;
                }
            };

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('music_prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.previous),
                    new ButtonBuilder()
                        .setCustomId('music_pause')
                        .setLabel('Pause')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.pause),
                    new ButtonBuilder()
                        .setCustomId('music_skip')
                        .setLabel('Skip')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.skip),
                    new ButtonBuilder()
                        .setCustomId('music_shuffle')
                        .setLabel('Shuffle')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.shuffle),
                    new ButtonBuilder()
                        .setCustomId('music_refresh_recs')
                        .setLabel('Refresh')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🔄')
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('music_stop')
                        .setLabel('Stop')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(emojis.stop)
                );

            const playerPosition = player && typeof player.position === 'number' ? player.position : 0;
            
            const selectMenuRow = new ActionRowBuilder();
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('recommendation_select')
                .setPlaceholder('Loading recommendations...');
            
            selectMenu.addOptions([
                {
                    label: 'Loading...',
                    value: 'loading',
                    emoji: '⏳'
                }
            ]);
            
            selectMenuRow.addComponents(selectMenu);
            
            // Get client from channel
            const clientInstance = channel?.client;
            
            return channel.send({ embeds: [buildEmbed(playerPosition)], components: [row, row2, selectMenuRow] }).then(async msg => {
                if (!player) return msg;
                
                // Generate recommendations and update message
                (async () => {
                    try {
                        const recs = await generateRecommendations(track, channel, clientInstance);
                        
                        if (recs && recs.length > 0) {
                            // Create fresh select menu with recommendations
                            const newSelectMenuRow = new ActionRowBuilder();
                            const newSelectMenu = new StringSelectMenuBuilder()
                                .setCustomId('recommendation_select')
                                .setPlaceholder(`Pick a song (${recs.length} available)`);
                            
                            const options = recs
                                .filter(rec => rec && rec.label && rec.value)
                                .map((rec) => ({
                                    label: rec.label.substring(0, 100),
                                    value: rec.value,
                                    emoji: rec.emoji
                                }))
                                .slice(0, 25);
                            
                            newSelectMenu.addOptions(options);
                            newSelectMenuRow.addComponents(newSelectMenu);
                            
                            // Update the message with recommendations
                            await msg.edit({ components: [row, row2, newSelectMenuRow] }).catch(() => {});
                        }
                    } catch (err) {
                        console.log('Error updating recommendations:', err.message);
                    }
                })();
                
                Promise.all([
                    getSpotifyRecommendations(
                        track.info.title || 'Unknown', 
                        track.info.author || 'Unknown'
                    ),
                    getYouTubeRecommendations(
                        track.info.title || 'Unknown', 
                        track.info.author || 'Unknown'
                    )
                ]).then(async ([spotifyRecs, youtubeRecs]) => {
                const allRecs = [];
                const seenLabels = new Set();

                const normalizeKey = (s = '') => {
                    let normalized = (s || '').toString().toLowerCase();
                    // Remove remix, version, and similar suffixes
                    normalized = normalized.replace(/\s*(remix|edit|version|feat|featuring|ft|ft\.|radio|live|acoustic|cover|mix|remaster|slowed|reverb)\s*/gi, ' ');
                    normalized = normalized.replace(/\([^)]*\)/g, ' ');
                    // Remove special characters but keep space structure
                    normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');
                    // Collapse multiple spaces and trim
                    normalized = normalized.replace(/\s+/g, ' ').trim();
                    return normalized;
                };

                const currentTitleNorm = normalizeKey(track?.info?.title || '');
                const currentAuthorNorm = normalizeKey(track?.info?.author || '');
                
                // Helper to check if a recommendation is similar to current track
                const isSimilarToCurrentTrack = (recNorm) => {
                    if (!recNorm) return false;
                    // Exact match
                    if (recNorm === currentTitleNorm) return true;
                    if (recNorm === currentAuthorNorm) return true;
                    
                    // Partial word match (prevent artist's other songs)
                    if (currentAuthorNorm && currentAuthorNorm.length > 3) {
                        if (recNorm.includes(currentAuthorNorm) || currentAuthorNorm.includes(recNorm)) return true;
                    }
                    
                    // Check if most of the words match (70%+ overlap)
                    const recWords = recNorm.split(' ').filter(w => w);
                    const currentWords = currentTitleNorm.split(' ').filter(w => w);
                    if (recWords.length > 0 && currentWords.length > 0) {
                        const commonWords = recWords.filter(w => currentWords.includes(w));
                        const overlapRatio = commonWords.length / Math.max(recWords.length, currentWords.length);
                        if (overlapRatio > 0.7) return true;
                    }
                    
                    return false;
                };
                
                const recentTitlesNorm = new Set();
                try {
                    if (global.stats && Array.isArray(global.stats.recentlyPlayed)) {
                        const recent5 = global.stats.recentlyPlayed.slice(-5);
                        for (const r of recent5) {
                            recentTitlesNorm.add(normalizeKey(r.title || ''));
                        }
                    }
                } catch (e) {}

                const recentlyRecommendedNorm = new Set();
                try {
                    if (global.recentlyRecommended && Array.isArray(global.recentlyRecommended)) {
                        const recentOnly = global.recentlyRecommended.slice(-8);
                        for (const r of recentOnly) {
                            recentlyRecommendedNorm.add(normalizeKey(r || ''));
                        }
                    }
                } catch (e) {}

                // Filter only compilation/remix indicators, not genre names
                const compilationBanned = ['remix', 'mix', 'playlist', 'megamix', 'mashup', 'compilation', 'medley'];
                const containsBanned = (s = '') => compilationBanned.some(b => (s || '').toLowerCase().includes(b));

                const client = channel?.client;
                const resolveWithTimeout = (query, ms = 1200) => {
                    return new Promise(resolve => {
                        let done = false;
                        const timer = setTimeout(() => {
                            if (!done) { done = true; resolve(null); }
                        }, ms);
                        (async () => {
                            try {
                                if (!client || !client.riffy) { clearTimeout(timer); return resolve(null); }
                                const res = await client.riffy.resolve({ query, requester: track.info.requester || undefined }).catch(() => null);
                                if (!done) {
                                    done = true;
                                    clearTimeout(timer);
                                    const t = res?.tracks?.[0];
                                    if (t && t.info && t.info.title) return resolve({ title: t.info.title, query });
                                    return resolve(null);
                                }
                            } catch (e) {
                                if (!done) { done = true; clearTimeout(timer); return resolve(null); }
                            }
                        })();
                    });
                };

                const candidates = [];
                if (spotifyRecs && Array.isArray(spotifyRecs)) {
                    for (const r of spotifyRecs.slice(0, 15)) {
                        if (!r || containsBanned(r)) continue;
                        const n = normalizeKey(r);
                        if (seenLabels.has(n)) continue;
                        candidates.push(r);
                        seenLabels.add(n);
                    }
                }
                if (youtubeRecs && Array.isArray(youtubeRecs)) {
                    for (const r of youtubeRecs) {
                        if (!r || containsBanned(r)) continue;
                        const n = normalizeKey(r);
                        if (seenLabels.has(n)) continue;
                        candidates.push(r);
                        seenLabels.add(n);
                    }
                }

                const artistShort = ((track?.info?.author || '').split(/&|,|feat|ft| and /i)[0] || '').trim();
                const textual = [];
                
                // TELUGU - 2 recommended
                textual.push('telugu superhit songs');
                textual.push('telugu movie songs');
                textual.push('telugu hit songs');
                textual.push('tollywood chartbusters');
                if (artistShort) {
                    textual.push(`${artistShort} telugu songs`);
                }
                
                // HINDI - 2 recommended
                textual.push('hindi superhit songs');
                textual.push('hindi movie songs');
                textual.push('bollywood romantic songs');
                textual.push('hindi chartbusters');
                if (artistShort) {
                    textual.push(`${artistShort} hindi songs`);
                }
                
                // GOD/DEVOTIONAL SONGS - 2 recommended
                textual.push('bhajans');
                textual.push('devotional songs');
                textual.push('god songs');
                textual.push('spiritual songs');
                
                // GENERAL VARIETY - 4+ more
                textual.push('bollywood hit songs');
                textual.push('south indian hit songs');
                textual.push('trending songs');
                textual.push('popular songs');
                if (artistShort) {
                    textual.push(`${artistShort} movie songs`);
                    textual.push(`${artistShort} songs`);
                }

                for (const t of textual) {
                    if (candidates.length >= 50) break; // Increase target candidates
                    const n = normalizeKey(t);
                    if (containsBanned(t) || seenLabels.has(n)) continue;
                    candidates.push(t);
                    seenLabels.add(n);
                }

                const promises = candidates.map(c => resolveWithTimeout(c, 1200));
                const settled = await Promise.allSettled(promises);

                for (let i = 0; i < settled.length && allRecs.length < 10; i++) {
                    const res = settled[i];
                    const cand = candidates[i];
                    let label = null;
                    let value = cand;
                    if (res.status === 'fulfilled' && res.value && res.value.title) {
                        label = res.value.title;
                        value = res.value.query || cand;
                    } else {
                        label = cand;
                        value = cand;
                    }
                    label = (label || '').substring(0, 80);
                    const key = normalizeKey(label);
                    if (!label) continue;

                    // Additional check: filter out titles with banned words
                    if (containsBanned(label)) continue;

                    // Filter out currently playing song and similar tracks
                    if (isSimilarToCurrentTrack(key)) continue;
                    if (recentTitlesNorm.has(key)) continue;
                    // Relaxed: Only filter out last 3 instead of last 8
                    if (global.recentlyRecommended && global.recentlyRecommended.length > 0) {
                        const lastThree = global.recentlyRecommended.slice(-3);
                        if (lastThree.some(r => normalizeKey(r || '') === key)) continue;
                    }
                    if (allRecs.find(ar => normalizeKey(ar.label) === key)) continue;

                    const emoji = spotifyRecs && spotifyRecs.includes(cand) ? '🎵' : (youtubeRecs && youtubeRecs.includes(cand) ? '▶️' : '🙏');
                    allRecs.push({ label, value, emoji });
                }

                if (allRecs.length > 10) allRecs.length = 10;

                if (allRecs.length > 0) {
                    track.info.recommendations = allRecs;
                    
                    // Cache recommendations globally for exact playback
                    if (!global.recommendationCache) global.recommendationCache = {};
                    const cacheKey = `${track.info.identifier || track.info.title}_${Date.now()}`;
                    global.recommendationCache[cacheKey] = {
                        recs: allRecs,
                        timestamp: Date.now(),
                        trackIdentifier: track.info.identifier || track.info.title
                    };
                    track.info.recommendationCacheKey = cacheKey;
                    
                    if (!global.recentlyRecommended) global.recentlyRecommended = [];
                    for (const rec of allRecs) {
                        const recKey = normalizeKey(rec.label);
                        if (!global.recentlyRecommended.find(r => normalizeKey(r) === recKey)) {
                            global.recentlyRecommended.push(rec.label);
                        }
                    }
                    if (global.recentlyRecommended.length > 12) {
                        global.recentlyRecommended = global.recentlyRecommended.slice(-12);
                    }
                    console.log(`✅ Loaded ${allRecs.length} recommendations`);
                }
            }).catch(err => {
                console.log('Failed to get recommendations:', err.message);
            });
            
            const initialTrackId = track.info.identifier || track.info.title;
                
                const updateInterval = setInterval(async () => {
                    try {
                        let currentTrack = null;
                        if (player.queue && player.queue.current) {
                            currentTrack = player.queue.current;
                        } else if (player.current) {
                            currentTrack = player.current;
                        } else if (player.nowPlaying) {
                            currentTrack = player.nowPlaying;
                        }
                        
                        const currentTrackId = currentTrack?.info?.identifier || currentTrack?.info?.title;
                        if (currentTrackId && initialTrackId && currentTrackId !== initialTrackId) {
                            await msg.delete().catch(() => {});
                            clearInterval(updateInterval);
                            return;
                        }
                        
                        if (!player || !currentTrack || currentTrack.info.isStream || !msg || !player.playing) {
                            clearInterval(updateInterval);
                            return;
                        }

                        const currentPosition = typeof player.position === 'number' ? player.position : 0;
                        
                        const newSelectMenuRow = new ActionRowBuilder();
                        const newSelectMenu = new StringSelectMenuBuilder()
                            .setCustomId('recommendation_select')
                            .setPlaceholder('Pick a recommendation');
                        
                        if (currentTrack.info.recommendations && currentTrack.info.recommendations.length > 0 && 
                            currentTrack.info.recommendations[0].emoji) {
                            const options = currentTrack.info.recommendations
                                .filter(rec => rec && rec.label && rec.value)
                                .map((rec) => ({
                                    label: rec.label.substring(0, 100),
                                    value: rec.value,
                                    emoji: rec.emoji
                                })).slice(0, 25);
                            
                            newSelectMenu.addOptions(options);
                        }
                        
                        newSelectMenuRow.addComponents(newSelectMenu);
                        await msg.edit({ embeds: [buildEmbed(currentPosition, currentTrack)], components: [row, row2, newSelectMenuRow] });
                    } catch (err) {
                        clearInterval(updateInterval);
                    }
                }, 3000);

                return msg;
            }).catch(err => {
                console.error('Error updating progress:', err.message);
            });
        } catch (err) {
            console.error('Error in nowPlaying function:', err.message);
            return channel.send({ content: `❌ Error displaying now playing: ${err.message}` }).catch(() => {});
        }
    },

    addedPlaylist: (channel, playlistInfo, tracks) => {
        const totalDuration = tracks.reduce((acc, track) => {
            if (!track.info.isStream && track.info.duration) {
                return acc + track.info.duration;
            }
            return acc;
        }, 0);

        const streamCount = tracks.filter(t => t.info.isStream).length;

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle(`${emojis.success} Playlist Added`)
            .setDescription(`**${playlistInfo.name}**`)
            .setTimestamp();

        if (playlistInfo.thumbnail) {
            embed.setThumbnail(playlistInfo.thumbnail);
        }

        embed.addFields([
            { name: '📊 Tracks', value: `${tracks.length} tracks`, inline: true },
            { name: '⏱️ Total Duration', value: formatDuration(totalDuration), inline: true },
            { name: '🔴 Streams', value: `${streamCount}`, inline: true }
        ]);

        return channel.send({ embeds: [embed] });
    },

    addedTrack: (channel, track, position) => {
        try {
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`${emojis.success} Added to Queue`)
                .setDescription(`**${track.info.title || 'Unknown'}**`)
                .setTimestamp();

            if (track.info.thumbnail) {
                try { embed.setThumbnail(track.info.thumbnail); } catch (e) {}
            }

            embed.addFields([
                { name: '📌 Position', value: `${position}`, inline: true },
                { name: '⏱️ Duration', value: getDurationString(track) || 'N/A', inline: true }
            ]);

            return channel.send({ embeds: [embed] }).catch(() => {});
        } catch (e) {
            return channel.send({ content: `✅ Added to queue: ${track.info.title || 'Unknown'}` }).catch(() => {});
        }
    },

    queueEnded: (channel) => {
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('<a:bye_bye:1475217491759206421>  im leaving voice channel...')
            .setDescription('songs completed, queue ended ... see you next time boi boiiiiii...')
            .setTimestamp();
        return channel.send({ embeds: [embed] });
    },

    queueList: (channel, queue, currentTrack, currentPage = 1, totalPages = 1) => {
        const embed = baseEmbed(`${emojis.queue} Queue List`);

        let description = '';

        if (currentTrack) {
            description = `**🎵 Now Playing:**\n[${currentTrack.info.title}](${currentTrack.info.uri})\n⏱️ ${getDurationString(currentTrack)}\n\n`;

            if (currentTrack.info.thumbnail) {
                embed.setThumbnail(currentTrack.info.thumbnail);
            }
        }

        if (queue.length > 0) {
            description += '**📋 Up Next:**';
            
            const tracksPerPage = 10;
            const startIndex = (currentPage - 1) * tracksPerPage;
            const endIndex = startIndex + tracksPerPage;
            const paginatedQueue = queue.slice(startIndex, endIndex);
            
            const tracksList = paginatedQueue.map((track, i) => {
                const trackNumber = startIndex + i + 1;
                return `\`${trackNumber.toString().padStart(2, '0')}\` [${track.info.title}](${track.info.uri}) ${getDurationString(track)}`;
            }).join('\n');

            embed.setDescription(description);
            embed.addFields([
                {
                    name: '\u200b',
                    value: tracksList,
                    inline: false
                }
            ]);

            const totalDuration = queue.reduce((acc, track) => {
                if (!track.info.isStream && track.info.duration) {
                    return acc + track.info.duration;
                }
                return acc;
            }, 0);

            const footer = `Total: ${queue.length} tracks | Duration: ${formatDuration(totalDuration)} | Page ${currentPage}/${totalPages}`;
            embed.setFooter({ text: footer });
        } else {
            embed.setDescription(description + '**No tracks in queue**');
            embed.setFooter({ text: `Page ${currentPage}/${totalPages}` });
        }

        return channel.send({ embeds: [embed] });
    },

    playerStatus: (channel, player) => {
        const embed = baseEmbed(`${emojis.info} Player Status`);

        const statusText = player.playing ? '▶️ Playing' : '⏸️ Paused';
        const loopModeText = player.loop === 'queue' ? '🔁 On' : '❌ Off';

        embed.addFields([
            { name: '🎵 Status', value: statusText, inline: true },
            { name: '🔊 Volume', value: `${player.volume}%`, inline: true },
            { name: '🔄 Loop', value: loopModeText, inline: true },
            { name: '📊 Queue Size', value: `${player.queue.length} tracks`, inline: true }
        ]);

        let currentTrack = null;
        if (player.queue && player.queue.current) {
            currentTrack = player.queue.current;
        } else if (player.current) {
            currentTrack = player.current;
        } else if (player.nowPlaying) {
            currentTrack = player.nowPlaying;
        }

        if (currentTrack) {
            const track = currentTrack;

            embed.addFields([
                {
                    name: '🎵 Current Track',
                    value: `[${track.info.title}](${track.info.uri})`,
                    inline: false
                },
                {
                    name: '⏱️ Duration',
                    value: getDurationString(track),
                    inline: false
                }
            ]);

            if (track.info.thumbnail) {
                embed.setThumbnail(track.info.thumbnail);
            }
        }

        return channel.send({ embeds: [embed] });
    },

    help: (channel, helpData, author) => {
        const embed = baseEmbed(`<a:book_ateex:1473980755704021105> Help & Info`)
            .setDescription(
                `<a:info:1474068746686435551>  **Welcome!**\n\n` +
                ` <a:prefix:1474088937440936097>  \`${helpData.prefix}\`\n` +
                `<a:light_bulb:1474263729477517527> **For command info:** \`${helpData.prefix}help <command>\`\n` +
                `**coming soon Slash commands:** Use \`/help\`\n`
            );

        if (author) {
            embed.setAuthor({
                name: author.username,
                iconURL: author.displayAvatarURL({ dynamic: true })
            });

            try { embed.setThumbnail(author.displayAvatarURL({ dynamic: true })); } catch (e) { }
        }

        embed.addFields([
            {
                name: '📌 Normal Commands',
                value: helpData.normalCommands.map(cmd => `\`${cmd}\``).join(' • '),
                inline: false
            },
            {
                name: '<a:music:1474074087042056253>  Music Commands',
                value: helpData.musicCommands.length > 0 
                    ? helpData.musicCommands.map(cmd => `\`${cmd}\``).join(' • ')
                    : 'Coming soon...',
                inline: false
            },
            {
                name: '📂 Playlist Commands',
                value: helpData.playlistCommands && helpData.playlistCommands.length > 0
                    ? helpData.playlistCommands.map(cmd => `\`${cmd}\``).join(' • ')
                    : 'Coming soon...',
                inline: false
            },
            {
                name: '<a:users:1474075424765247780>  User Commands',
                value: helpData.userCommands && helpData.userCommands.length > 0
                    ? helpData.userCommands.map(cmd => `\`${cmd}\``).join(' • ')
                    : 'No commands available',
                inline: false
            },
            {
                name: '<a:filter:1474074633283178578>  Filter Commands',
                value: helpData.filterCommands.length > 0 
                    ? helpData.filterCommands.map(cmd => `\`${cmd}\``).join(' • ')
                    : 'Coming soon...',
                inline: false
            },
            {
                name: '<a:ACZ_blue_effects:1474074999525740757>  Effect Commands',
                value: helpData.effectCommands.length > 0 
                    ? helpData.effectCommands.map(cmd => `\`${cmd}\``).join(' • ')
                    : 'Coming soon...',
                inline: false
            }
        ]);

        embed.setFooter({
            text: '⚙️ Powered By flute music team',
            iconURL: channel.client.user.displayAvatarURL()
        });

        const buttonRow = buttonUtils.createHelpCommandButtons(config);
        return channel.send({ embeds: [embed], components: buttonRow ? [buttonRow] : [] });
    },

    // Helper exports
    formatDuration,
    getDurationString,
    detectLanguage,
    getSpotifyRecommendations,
    getYouTubeRecommendations,
    generateRecommendations,
    createHelpButton,
    createHelpButtons,
    isValidURL,
    // Button utilities
    createButton: buttonUtils.createButton,
    createButtonRow: buttonUtils.createButtonRow
};


