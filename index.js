require("dotenv").config();
const { Client, GatewayDispatchEvents, Collection, ActivityType, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const express = require('express');
const crypto = require("crypto");
const Razorpay = require("razorpay");
const webhookRoutes = require("./server/webhook");
const config = require("./config.js");
const connectDB = require("./database");
const { Riffy } = require('riffy');
const messages = require("./utils/messages.js");
const emojis = require("./emojis.js");
const setVoiceStatus = require('./utils/voiceStatus');
const statusRotator = require("./utils/statusRotator.js");
const { requirePremium } = require("./utils/requirePremium");
const paymentUtils = require("./utils/paymentUtils");
const growthUtils = require("./utils/growthUtils");
const webhookNotifier = require("./utils/webhookNotifier");
const autoCaption = require("./utils/autoCaption");
const { listPlans, normalizePlan, isTestAmountEnabled } = require("./utils/premiumPlans");
const { syncPremiumRoleForUser } = require("./premium/roleSystem");
const { startUptimeReporter } = require("./utils/uptimeReporter");
const fs = require("fs");
const path = require("path");
const fsp = require('fs').promises;
const axios = require('axios');
const { startPremiumExpiryChecker } =
require("./premium/premiumScheduler");
const { startupPremiumSync } =
require("./premium/startupSync");

connectDB();

// Start Express server for webhooks    
// Startup performance monitoring
const startupTime = Date.now();
console.log('Bot startup started...');
// Store interval IDs for cleanup on shutdown
const activeIntervals = [];
// Bot stats tracking
const stats = {
    totalSongsPlayed: 0,
    startTime: Date.now(),
    totalPlaytime: 0,
    totalCommandsExecuted: 0,
    twentyFourSevenServers: new Set(),
    autoplayServers: new Set(),
    autoplayModesByGuild: {}, // { guildId: "similar" | "artist" | "random" }
    autoplaySetByGuild: {}, // { guildId: userId }
    recentlyPlayed: [], // Last 20 songs
    errorCount: 0,
    guildActivity: {}, // {guildId: songCount}
    guildPlaytime: {}, // {guildId: playtimeMs}
    websiteGuildViews: {}, // {guildId: website card impressions}
    topArtists: {}, // {artistName: count}
    commandErrors: [] // Track command errors
};

function sanitizeNumericMap(rawMap) {
    if (!rawMap || typeof rawMap !== "object") {
        return {};
    }

    const sanitized = {};
    for (const [key, rawValue] of Object.entries(rawMap)) {
        const numericValue = Number(rawValue);
        if (!Number.isFinite(numericValue) || numericValue < 0) {
            continue;
        }
        sanitized[key] = numericValue;
    }
    return sanitized;
}

// User data (favorites and history)
const userData = {}; // {userId: {favorites: [], history: []}}

// Track song history per guild for Previous button (stack of played songs)
const songHistory = {}; // {guildId: [track1, track2, ...]}

const COMMAND_DEFAULT_COOLDOWN_MS = 2000;
const SPAM_WINDOW_MS = 10000;
const SPAM_MAX_COMMANDS = 8;
const SPAM_TEMP_BLOCK_MS = 15000;

const commandCooldowns = new Map(); // `${userId}:${commandName}` -> expiresAt
const userCommandWindows = new Map(); // userId -> [timestamps]
const temporarilyBlockedUsers = new Map(); // userId -> unblockAt

const AUTOPLAY_MODES = new Set(["similar", "artist", "random"]);

function isFeatureEnabled(rawValue, fallback = true) {
    const value = String(rawValue || "").trim().toLowerCase();
    if (!value) return fallback;
    return value === "1" || value === "true" || value === "yes" || value === "on";
}

function getWelcomeChannelId() {
    return String(process.env.WELCOME_CHANNEL_ID || "").trim();
}

function getWelcomePosterUrl() {
    const fallback =
        "https://cdn.discordapp.com/attachments/1475863623934148680/1477229390697070602/IMG_20260228_141726.jpg?ex=69a40094&is=69a2af14&hm=cb33fd40609c3133d9650f7f185731b7de86e45014245dd6ceaf330f569fa90e&";
    const configured = String(process.env.WELCOME_POSTER_URL || "").trim();
    return configured || fallback;
}

function getWelcomePosterFilePath() {
    const configured = String(process.env.WELCOME_POSTER_FILE || "").trim();
    if (!configured) {
        return path.join(__dirname, "images", "welcome-fm.jpg");
    }

    return path.isAbsolute(configured)
        ? configured
        : path.join(__dirname, configured);
}

function parseBoolean(value, fallback = false) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return fallback;
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getTopggAuthToken() {
    return String(process.env.TOPGG_TOKEN || "").trim();
}

function shouldAutoThankVoters() {
    return isFeatureEnabled(process.env.AUTO_THANK_VOTERS, true);
}

function getVoteThankChannelId() {
    return String(process.env.VOTE_THANK_CHANNEL_ID || "").trim();
}

function getVoteThankGuildId() {
    return String(process.env.VOTE_THANK_GUILD_ID || "").trim();
}

function isWeekendVote(payload) {
    if (!payload || typeof payload !== "object") return false;

    if (payload.isWeekend === true || payload.weekend === true) return true;
    if (payload.isWeekend === 1 || payload.weekend === 1) return true;

    return parseBoolean(payload.isWeekend, false) || parseBoolean(payload.weekend, false);
}

function isTopggAuthorized(req) {
    const expectedToken = getTopggAuthToken();
    if (!expectedToken) return false;

    const providedToken = String(req.headers?.authorization || "").trim();
    if (!providedToken) return false;

    return timingSafeHexEqual(providedToken, expectedToken);
}

function formatRetryAfter(retryAfterMs) {
    const totalSeconds = Math.max(0, Math.ceil((Number(retryAfterMs) || 0) / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

async function sendVoteThanks(client, userId, reward, payload = {}) {
    if (!shouldAutoThankVoters()) return;

    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return;

    const voteType = String(payload.type || "upvote").toLowerCase();
    const rewardGranted = reward?.granted === true;
    const rewardTokens = Number(reward?.rewardTokens || 0);
    const totalTokens = Number(reward?.trialTokens || 0);
    const retryText = reward?.retryAfterMs
        ? ` Reward cooldown active for ${formatRetryAfter(reward.retryAfterMs)}.`
        : "";

    const dmDescription = rewardGranted
        ? `Thanks for voting on Top.gg. You received **+${rewardTokens} trial token${rewardTokens === 1 ? "" : "s"}**.`
        : `Thanks for voting on Top.gg.${retryText}`;

    const dmEmbed = new EmbedBuilder()
        .setColor("#00C853")
        .setTitle("Vote Received - Thank You")
        .setDescription(dmDescription)
        .addFields(
            { name: "Vote Type", value: voteType, inline: true },
            { name: "Your Trial Tokens", value: String(totalTokens), inline: true }
        )
        .setTimestamp();

    const user = await client.users.fetch(normalizedUserId).catch(() => null);
    if (user) {
        await user.send({ embeds: [dmEmbed] }).catch(() => {});
    }

    const thankChannelId = getVoteThankChannelId();
    if (!thankChannelId) return;

    const channel = client.channels.cache.get(thankChannelId)
        || await client.channels.fetch(thankChannelId).catch(() => null);
    if (!channel || !channel.isTextBased?.()) return;

    const requiredGuildId = getVoteThankGuildId();
    if (requiredGuildId && channel.guildId && channel.guildId !== requiredGuildId) {
        console.warn(`Vote thank skipped: channel guild mismatch (${channel.guildId} != ${requiredGuildId})`);
        return;
    }

    const publicEmbed = new EmbedBuilder()
        .setColor("#00C853")
        .setTitle("New Top.gg Vote")
        .setDescription(
            rewardGranted
                ? `<@${normalizedUserId}> thanks for voting. +${rewardTokens} trial token${rewardTokens === 1 ? "" : "s"} added.`
                : `<@${normalizedUserId}> thanks for voting. Vote registered${retryText ? `.${retryText}` : "."}`
        )
        .addFields(
            { name: "Vote Type", value: voteType, inline: true },
            { name: "Trial Tokens", value: String(totalTokens), inline: true }
        )
        .setTimestamp();

    await channel.send({
        content: `<@${normalizedUserId}>`,
        embeds: [publicEmbed],
        allowedMentions: { users: [normalizedUserId] }
    }).catch((error) => {
        console.error("Failed to send vote thank message:", error.message);
    });
}

async function sendWelcomePoster(member) {
    const channelId = getWelcomeChannelId();
    if (!channelId) {
        console.warn("Welcome skipped: WELCOME_CHANNEL_ID not set");
        return;
    }

    if (!isFeatureEnabled(process.env.WELCOME_POSTER_ENABLED, true)) {
        console.log("Welcome skipped: WELCOME_POSTER_ENABLED is off");
        return;
    }

    const targetGuildId = String(process.env.WELCOME_GUILD_ID || "").trim();
    if (targetGuildId && targetGuildId !== member.guild.id) {
        console.log(`Welcome skipped: guild mismatch (${member.guild.id})`);
        return;
    }

    const channel =
        member.client.channels.cache.get(channelId) ||
        await member.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased?.()) {
        console.warn(`Welcome skipped: channel not found/text (${channelId})`);
        return;
    }

    if (channel.guildId && channel.guildId !== member.guild.id) {
        console.warn(`Welcome skipped: channel guild mismatch (${channel.guildId} != ${member.guild.id})`);
        return;
    }

    try {
        const memberCount = Number(member.guild.memberCount) || 0;
        const embed = new EmbedBuilder()
            .setColor("#7ED321")
            .setTitle("**WELCOM TO FLUTE MUSIC COMMUNITY**")
            .setDescription(`MEMBER COUNT: **${memberCount}**`)
            .setTimestamp();

        const posterFilePath = getWelcomePosterFilePath();
        const hasLocalPoster = fs.existsSync(posterFilePath);

        if (hasLocalPoster) {
            const attachment = new AttachmentBuilder(posterFilePath, { name: "welcome-fm.jpg" });
            embed.setImage("attachment://welcome-fm.jpg");
            await channel.send({
                content: `${member}`,
                embeds: [embed],
                files: [attachment],
                allowedMentions: { users: [member.id] }
            });
        } else {
            const posterUrl = getWelcomePosterUrl();
            embed.setImage(posterUrl);
            await channel.send({
                content: `${member}`,
                embeds: [embed],
                allowedMentions: { users: [member.id] }
            });
        }

        console.log(`Welcome sent in guild ${member.guild.id} for ${member.user.tag}`);
    } catch (error) {
        console.error("Failed to send welcome poster:", error.message);
    }
}
function isOwnerUser(userId) {
    if (!userId) return false;

    if (config.ownerID && String(config.ownerID) === String(userId)) {
        return true;
    }

    if (Array.isArray(config.owners) && config.owners.map(String).includes(String(userId))) {
        return true;
    }

    return false;
}

function isUserRateLimited(userId, nowMs = Date.now()) {
    const blockedUntil = temporarilyBlockedUsers.get(userId) || 0;
    if (blockedUntil > nowMs) {
        return { blocked: true, retryAfterMs: blockedUntil - nowMs };
    }

    if (blockedUntil > 0 && blockedUntil <= nowMs) {
        temporarilyBlockedUsers.delete(userId);
    }

    const windowStart = nowMs - SPAM_WINDOW_MS;
    const previous = userCommandWindows.get(userId) || [];
    const next = previous.filter((ts) => ts > windowStart);
    next.push(nowMs);
    userCommandWindows.set(userId, next);

    if (next.length > SPAM_MAX_COMMANDS) {
        const unblockAt = nowMs + SPAM_TEMP_BLOCK_MS;
        temporarilyBlockedUsers.set(userId, unblockAt);
        return { blocked: true, retryAfterMs: SPAM_TEMP_BLOCK_MS };
    }

    return { blocked: false, retryAfterMs: 0 };
}

function getTrackFingerprint(track) {
    if (!track || !track.info) return "";

    const identifier = String(track.info.identifier || "").trim().toLowerCase();
    if (identifier) return `id:${identifier}`;

    const uri = String(track.info.uri || "").trim().toLowerCase();
    if (uri) return `uri:${uri}`;

    const title = String(track.info.title || "").trim().toLowerCase();
    const author = String(track.info.author || "").trim().toLowerCase();
    return `meta:${title}:${author}`;
}

function sameTrack(a, b) {
    return getTrackFingerprint(a) !== "" && getTrackFingerprint(a) === getTrackFingerprint(b);
}

function normalizeTrackText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
        .replace(/\b(official|video|lyrics?|audio|hd|hq|4k|remaster(ed)?|version|full|song|feat\.?|ft\.?)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const AUTOPLAY_LANGUAGE_HINTS = {
    telugu: {
        tokens: ["telugu", "tollywood"],
        script: /[\u0C00-\u0C7F]/
    },
    hindi: {
        tokens: ["hindi", "bollywood"],
        script: /[\u0900-\u097F]/
    }
};

const AUTOPLAY_LANGUAGE_GUARDRAILS = {
    telugu: {
        include: ["telugu", "tollywood"],
        exclude: ["hindi", "bollywood", "punjabi", "bhojpuri"]
    },
    hindi: {
        include: ["hindi", "bollywood"],
        exclude: ["telugu", "tollywood", "tamil", "kollywood", "kannada", "malayalam"]
    }
};

function buildTrackSearchBlob(track) {
    if (!track || !track.info) return "";

    return [
        track.info.title,
        track.info.author,
        track.info.originalTitle,
        track.info.originalAuthor,
        track.info.uri,
        track.info.originalUri,
        track.info.identifier,
        track.info.sourceName,
        track.info.originalSourceName
    ]
        .filter(Boolean)
        .join(" ");
}

function inferAutoplayLanguageFromText(value) {
    const raw = String(value || "");
    if (!raw) return null;

    for (const [language, hint] of Object.entries(AUTOPLAY_LANGUAGE_HINTS)) {
        if (hint.script.test(raw)) {
            return language;
        }
    }

    const normalized = ` ${normalizeTrackText(raw)} `;
    for (const [language, hint] of Object.entries(AUTOPLAY_LANGUAGE_HINTS)) {
        for (const token of hint.tokens) {
            if (normalized.includes(` ${token} `)) {
                return language;
            }
        }
    }

    return null;
}

function inferTrackLanguage(track) {
    return inferAutoplayLanguageFromText(buildTrackSearchBlob(track));
}

function trackHasLanguageToken(track, language) {
    const hints = AUTOPLAY_LANGUAGE_GUARDRAILS[language];
    if (!hints || !Array.isArray(hints.include) || hints.include.length === 0) {
        return false;
    }

    const normalized = ` ${normalizeTrackText(buildTrackSearchBlob(track))} `;
    for (const token of hints.include) {
        if (normalized.includes(` ${token} `)) {
            return true;
        }
    }
    return false;
}

function trackHasForeignLanguageToken(track, preferredLanguage) {
    const hints = AUTOPLAY_LANGUAGE_GUARDRAILS[preferredLanguage];
    if (!hints || !Array.isArray(hints.exclude) || hints.exclude.length === 0) {
        return false;
    }

    const normalized = ` ${normalizeTrackText(buildTrackSearchBlob(track))} `;
    for (const token of hints.exclude) {
        if (normalized.includes(` ${token} `)) {
            return true;
        }
    }
    return false;
}

function addLanguageBiasedQueries(queries, preferredLanguage, autoplayMode) {
    if (!Array.isArray(queries) || queries.length === 0) return [];

    const merged = [];
    const seen = new Set();

    const pushQuery = (value) => {
        const text = String(value || "").trim();
        if (!text) return;
        const key = text.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(text);
    };

    for (const query of queries) {
        pushQuery(query);
        if (!preferredLanguage) continue;

        if (autoplayMode === "artist") {
            pushQuery([preferredLanguage, query].join(" ").trim());
        } else if (autoplayMode === "similar") {
            pushQuery([query, preferredLanguage, "official audio"].join(" ").trim());
        } else {
            pushQuery([preferredLanguage, "songs official audio"].join(" ").trim());
        }
    }

    return merged.slice(0, 12);
}

function sanitizeAutoplayMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    return AUTOPLAY_MODES.has(mode) ? mode : "similar";
}

function getGuildAutoplayMode(guildId) {
    if (!stats.autoplayModesByGuild || typeof stats.autoplayModesByGuild !== "object") {
        stats.autoplayModesByGuild = {};
    }
    return sanitizeAutoplayMode(stats.autoplayModesByGuild[guildId]);
}

function getTrackMetaKey(track) {
    if (!track || !track.info) return "";
    const title = normalizeTrackText(track.info.title);
    const author = normalizeTrackText(track.info.author);
    if (title && author) return `${author}:${title}`;
    return title || author || "";
}

const AUTOPLAY_BLOCKLIST_KEYWORDS = [
    "playlist",
    "mix",
    "mashup",
    "non stop",
    "nonstop",
    "dj",
    "jukebox",
    "compilation",
    "hour version",
    "1 hour",
    "2 hour",
    "3 hour",
    "24x7",
    "24 7",
    "live stream",
    "podcast",
    "study",
    "sleep",
    "gym",
    "workout",
    "chill",
    "lofi",
    "meditation"
];

const AUTOPLAY_ALT_VERSION_KEYWORDS = [
    "slowed",
    "reverb",
    "nightcore",
    "sped up",
    "8d",
    "bass boosted",
    "remix",
    "karaoke",
    "cover"
];

function includesAnyKeyword(text, keywords = []) {
    const normalized = ` ${normalizeTrackText(text)} `;
    if (!normalized.trim()) return false;

    for (const keyword of keywords) {
        const token = normalizeTrackText(keyword);
        if (!token) continue;
        if (normalized.includes(` ${token} `)) {
            return true;
        }
    }

    return false;
}

function tokenizeAutoplayText(value) {
    return normalizeTrackText(value)
        .split(" ")
        .filter((word) => word.length > 2);
}

function wordOverlapRatio(left, right) {
    const leftWords = new Set(tokenizeAutoplayText(left));
    const rightWords = new Set(tokenizeAutoplayText(right));

    if (leftWords.size === 0 || rightWords.size === 0) {
        return 0;
    }

    let overlap = 0;
    for (const word of leftWords) {
        if (rightWords.has(word)) {
            overlap += 1;
        }
    }

    const minSize = Math.min(leftWords.size, rightWords.size);
    return minSize > 0 ? (overlap / minSize) : 0;
}

function getTrackDurationMs(track) {
    const rawLength = Number(track?.info?.length || track?.info?.duration || 0);
    if (!Number.isFinite(rawLength) || rawLength <= 0) {
        return 0;
    }
    return rawLength;
}

function isLikelySongCandidate(track, autoplayMode) {
    if (!track || !track.info) return false;
    if (track.info.isStream) return false;

    const title = String(track.info.title || "");
    const normalizedTitle = normalizeTrackText(title);
    if (!normalizedTitle) return false;

    const durationMs = getTrackDurationMs(track);
    if (durationMs > 0 && durationMs < 60000) return false;
    if (durationMs > 0 && durationMs > 12 * 60 * 1000) return false;

    if (includesAnyKeyword(normalizedTitle, AUTOPLAY_BLOCKLIST_KEYWORDS)) {
        return false;
    }

    if (autoplayMode === "random" && includesAnyKeyword(normalizedTitle, AUTOPLAY_ALT_VERSION_KEYWORDS)) {
        return false;
    }

    return true;
}

function buildRandomAutoplayPool(preferredLanguage) {
    if (preferredLanguage) {
        return [
            `${preferredLanguage} hit songs official audio`,
            `${preferredLanguage} latest songs official audio`,
            `${preferredLanguage} top songs official audio`,
            `${preferredLanguage} chart songs official audio`,
            `${preferredLanguage} trending songs official audio`,
            `${preferredLanguage} melody songs official audio`
        ];
    }

    return [
        "top songs official audio",
        "latest songs official audio",
        "trending songs official audio",
        "popular songs official audio",
        "chartbuster songs official audio",
        "best songs official audio"
    ];
}

function buildRecentTrackMetaSet(guildId, limit = 30) {
    const recentEntries = Array.isArray(stats?.recentlyPlayed) ? stats.recentlyPlayed : [];
    const set = new Set();

    for (let i = recentEntries.length - 1; i >= 0 && set.size < limit; i -= 1) {
        const entry = recentEntries[i];
        if (!entry || !entry.title) continue;
        if (guildId && String(entry.guildId || "") !== String(guildId)) continue;

        const key = getTrackMetaKey({
            info: {
                title: entry.title,
                author: entry.author || ""
            }
        });

        if (key) {
            set.add(key);
        }
    }

    return set;
}

function scoreAutoplayCandidate(candidate, seedTrack, autoplayMode, preferredLanguage, recentMetaSet) {
    if (!candidate || !candidate.info || !seedTrack || !seedTrack.info) {
        return Number.NEGATIVE_INFINITY;
    }

    const candidateTitle = normalizeTrackText(candidate.info.title);
    const candidateAuthor = normalizeTrackText(candidate.info.author);
    const seedTitle = normalizeTrackText(seedTrack.info.title);
    const seedAuthor = normalizeTrackText(seedTrack.info.author);

    if (!candidateTitle) {
        return Number.NEGATIVE_INFINITY;
    }

    let score = 0;

    const durationMs = getTrackDurationMs(candidate);
    if (durationMs >= 120000 && durationMs <= 420000) {
        score += 10;
    } else if (durationMs > 0 && durationMs < 90000) {
        score -= 18;
    } else if (durationMs > 0 && durationMs > 720000) {
        score -= 14;
    }

    const metaKey = getTrackMetaKey(candidate);
    if (metaKey && recentMetaSet?.has(metaKey)) {
        score -= 20;
    }

    const titleOverlap = wordOverlapRatio(seedTitle, candidateTitle);
    const authorOverlap = wordOverlapRatio(seedAuthor, candidateAuthor);

    if (autoplayMode === "artist") {
        score += Math.round(authorOverlap * 60);
        score += Math.round(titleOverlap * 10);
    } else if (autoplayMode === "similar") {
        score += Math.round(titleOverlap * 50);
        score += Math.round(authorOverlap * 18);
    } else {
        score += Math.round(titleOverlap * 6);
        if (seedAuthor && candidateAuthor && seedAuthor === candidateAuthor) {
            score -= 5;
        }
    }

    if (seedAuthor && candidateAuthor && seedAuthor === candidateAuthor) {
        score += autoplayMode === "artist" ? 30 : 8;
    } else if (
        seedAuthor &&
        candidateAuthor &&
        (candidateAuthor.includes(seedAuthor) || seedAuthor.includes(candidateAuthor)) &&
        Math.min(seedAuthor.length, candidateAuthor.length) >= 4
    ) {
        score += autoplayMode === "artist" ? 18 : 6;
    }

    if (candidateTitle.includes("official")) score += 5;
    if (candidateTitle.includes("audio")) score += 4;

    if (includesAnyKeyword(candidateTitle, AUTOPLAY_ALT_VERSION_KEYWORDS)) {
        score -= autoplayMode === "random" ? 18 : 10;
    }

    if (preferredLanguage) {
        const candidateLanguage = inferTrackLanguage(candidate);

        if (candidateLanguage === preferredLanguage) {
            score += 20;
        } else if (candidateLanguage && candidateLanguage !== preferredLanguage) {
            score -= 40;
        }

        if (trackHasLanguageToken(candidate, preferredLanguage)) {
            score += 15;
        }

        if (trackHasForeignLanguageToken(candidate, preferredLanguage)) {
            score -= 28;
        }
    }

    return score;
}

function looksLikeSameSong(a, b) {
    if (!a || !b || !a.info || !b.info) return false;
    if (sameTrack(a, b)) return true;

    const aTitle = normalizeTrackText(a.info.title);
    const bTitle = normalizeTrackText(b.info.title);
    const aAuthor = normalizeTrackText(a.info.author);
    const bAuthor = normalizeTrackText(b.info.author);

    if (!aTitle || !bTitle) return false;

    if (aTitle === bTitle) {
        return true;
    }

    const titleContains = (aTitle.includes(bTitle) || bTitle.includes(aTitle))
        && Math.min(aTitle.length, bTitle.length) >= 8;
    if (titleContains) {
        return true;
    }

    const aWords = new Set(aTitle.split(" ").filter((word) => word.length > 2));
    const bWords = new Set(bTitle.split(" ").filter((word) => word.length > 2));
    if (aWords.size > 0 && bWords.size > 0) {
        let overlap = 0;
        for (const word of aWords) {
            if (bWords.has(word)) overlap += 1;
        }

        const minSize = Math.min(aWords.size, bWords.size);
        const ratio = minSize > 0 ? (overlap / minSize) : 0;
        if (ratio >= 0.75) {
            return true;
        }

        if (aAuthor && bAuthor && aAuthor === bAuthor && ratio >= 0.55) {
            return true;
        }
    }

    return false;
}

function cloneTrackSnapshot(track) {
    if (!track || !track.info) return null;

    return {
        ...track,
        info: {
            ...track.info,
            requester: track.info.requester || null
        }
    };
}

function pushGuildSongHistory(guildId, track) {
    const snapshot = cloneTrackSnapshot(track);
    if (!snapshot) return;

    if (!songHistory[guildId]) {
        songHistory[guildId] = [];
    }

    const history = songHistory[guildId];
    history.push(snapshot);

    if (history.length > 30) {
        history.splice(0, history.length - 30);
    }
}

function recordTrackAnalytics(guildId, track) {
    if (!track || !track.info) return;

    const trackLengthMs = Number(track.info.length) || 0;
    stats.totalSongsPlayed += 1;
    stats.totalPlaytime += trackLengthMs;
    stats.guildActivity[guildId] = (stats.guildActivity[guildId] || 0) + 1;
    stats.guildPlaytime[guildId] = (stats.guildPlaytime[guildId] || 0) + trackLengthMs;

    const artistName = String(track.info.author || "Unknown").trim();
    if (artistName) {
        stats.topArtists[artistName] = (stats.topArtists[artistName] || 0) + 1;
    }

    stats.recentlyPlayed.push({
        title: track.info.title || "Unknown",
        author: track.info.author || "Unknown",
        uri: track.info.uri || "",
        guildId,
        timestamp: Date.now()
    });

    if (stats.recentlyPlayed.length > 200) {
        stats.recentlyPlayed.splice(0, stats.recentlyPlayed.length - 200);
    }
}

function recordUserHistory(track) {
    if (!track || !track.info) return;
    const requesterId = track.info.requester?.id;
    if (!requesterId) return;

    if (!userData[requesterId]) {
        userData[requesterId] = { favorites: [], history: [] };
    }

    const history = userData[requesterId].history || [];
    history.unshift({
        title: track.info.title || "Unknown",
        author: track.info.author || "Unknown",
        uri: track.info.uri || "",
        duration: Number(track.info.length) || 0,
        timestamp: Date.now()
    });

    if (history.length > 100) {
        history.splice(100);
    }

    userData[requesterId].history = history;
}

async function resolveAutoplayTrack(client, player, seedTrack, mode = "similar") {
    if (!seedTrack || !seedTrack.info) return null;

    const title = String(seedTrack.info.title || "").trim();
    const author = String(seedTrack.info.author || "").trim();

    if (!title) return null;

    const requester = seedTrack.info.requester || client.user;
    const autoplayMode = sanitizeAutoplayMode(mode);
    const preferredLanguage = inferTrackLanguage(seedTrack);

    let queries = [];
    if (autoplayMode === "artist") {
        queries = [
            [author, "top songs official audio"].filter(Boolean).join(" ").trim(),
            [author, "hit songs official audio"].filter(Boolean).join(" ").trim(),
            [author, "popular songs official"].filter(Boolean).join(" ").trim()
        ];
    } else if (autoplayMode === "random") {
        const randomPool = buildRandomAutoplayPool(preferredLanguage);
        const shuffledPool = [...randomPool].sort(() => Math.random() - 0.5);
        queries = shuffledPool.slice(0, 4);
    } else {
        queries = [
            [title, author, "official audio"].filter(Boolean).join(" ").trim(),
            [title, author, "similar songs"].filter(Boolean).join(" ").trim(),
            [title, author, "related songs"].filter(Boolean).join(" ").trim(),
            [title, author].filter(Boolean).join(" ").trim()
        ];
    }

    queries = addLanguageBiasedQueries(queries.filter((q) => q.length > 0), preferredLanguage, autoplayMode);

    const sources = ["ytmsearch", "ytsearch"];
    const resolvedTracks = [];
    const seen = new Set();

    for (const query of queries) {
        for (const source of sources) {
            try {
                const result = await client.riffy.resolve({ query, source, requester });
                if (!result?.tracks?.length) continue;

                for (const track of result.tracks.slice(0, 25)) {
                    const uniq = getTrackFingerprint(track) || `meta:${getTrackMetaKey(track)}`;
                    if (!uniq || seen.has(uniq)) continue;
                    seen.add(uniq);
                    resolvedTracks.push(track);
                }
            } catch (error) {
                // Ignore source failure and continue.
            }
        }
    }

    if (!resolvedTracks.length) {
        return null;
    }

    const current = player?.queue?.current || player?.current || player?.nowPlaying || null;
    const recentHistory = (songHistory[player.guildId] || []).slice(-10);
    const blockedTracks = [seedTrack, current, ...recentHistory].filter(Boolean);
    const recentMetaSet = buildRecentTrackMetaSet(player.guildId, 30);

    const scored = [];
    const languageMatched = [];
    const languageNeutral = [];

    for (const candidate of resolvedTracks) {
        const isBlocked = blockedTracks.some((tracked) => looksLikeSameSong(candidate, tracked));
        if (isBlocked) continue;
        if (!isLikelySongCandidate(candidate, autoplayMode)) continue;

        const candidateLanguage = inferTrackLanguage(candidate);
        const hasPreferredToken = preferredLanguage
            ? trackHasLanguageToken(candidate, preferredLanguage)
            : false;
        const hasForeignToken = preferredLanguage
            ? trackHasForeignLanguageToken(candidate, preferredLanguage)
            : false;

        if (preferredLanguage) {
            const explicitMismatch = Boolean(candidateLanguage && candidateLanguage !== preferredLanguage);
            if (explicitMismatch || hasForeignToken) {
                continue;
            }
        }

        const score = scoreAutoplayCandidate(
            candidate,
            seedTrack,
            autoplayMode,
            preferredLanguage,
            recentMetaSet
        );

        if (!Number.isFinite(score)) continue;

        const item = { track: candidate, score, candidateLanguage, hasPreferredToken };
        scored.push(item);

        if (preferredLanguage) {
            if (candidateLanguage === preferredLanguage || hasPreferredToken) {
                languageMatched.push(item);
            } else {
                languageNeutral.push(item);
            }
        }
    }

    const pickBest = (items, randomizeTop = false) => {
        if (!Array.isArray(items) || items.length === 0) return null;

        const sorted = [...items].sort((a, b) => b.score - a.score);
        if (!randomizeTop) {
            return sorted[0].track;
        }

        const topPool = sorted.slice(0, Math.min(3, sorted.length));
        const pick = topPool[Math.floor(Math.random() * topPool.length)];
        return pick?.track || sorted[0].track;
    };

    const randomizeTop = autoplayMode === "random";

    if (preferredLanguage) {
        const strictPick = pickBest(languageMatched, randomizeTop);
        if (strictPick) return strictPick;

        const neutralPick = pickBest(languageNeutral, randomizeTop);
        if (neutralPick) return neutralPick;

        return null;
    }

    return pickBest(scored, randomizeTop);
}

// Core playback/info commands should always remain freely accessible (no premium/vote lock).
const coreFreeCommands = new Set([
    "help", "ping", "play", "pause", "resume", "skip", "stop", "queue",
    "nowplaying", "volume", "loop", "shuffle", "seek", "remove", "clearqueue",
    "clear", "replay"
]);

const advancedPremiumCommands = new Set([
    "8d",
    "chipmunkfilter",
    "cinema",
    "daycore",
    "darthvader",
    "doubletime",
    "earrape",
    "echo",
    "equalizer",
    "karaoke",
    "lofi",
    "nightcore",
    "party",
    "pop",
    "radio",
    "slowedreverb",
    "slowmode",
    "soft",
    "telephone",
    "treblebass",
    "tremolo",
    "underwater",
    "vaporwave",
    "vibrato",
    "vocalboost"
]);

const statsPath = path.join(__dirname, 'stats.json');
const userDataPath = path.join(__dirname, 'userdata.json');
const websiteStatusPath = path.join(__dirname, "website", "status.json");
const websiteLiveStatsPath = path.join(__dirname, "website", "live-server-stats.json");

function getDefaultServerLogo() {
    const configuredLogo = String(process.env.SERVER_LOGO_FALLBACK || "").trim();
    if (configuredLogo) {
        return configuredLogo;
    }
    return "/image.png";
}

// Load existing stats
async function loadStats() {
    try {
        if (fs.existsSync(statsPath)) {
            const data = JSON.parse(await fsp.readFile(statsPath, 'utf8'));
            stats.totalSongsPlayed = data.totalSongsPlayed || 0;
            stats.totalPlaytime = data.totalPlaytime || 0;
            stats.totalCommandsExecuted = data.totalCommandsExecuted || 0;
            stats.twentyFourSevenServers = new Set(data.twentyFourSevenServers || []);
            stats.autoplayServers = new Set(data.autoplayServers || []);
            const rawAutoplayModes = data.autoplayModesByGuild || {};
            const sanitizedAutoplayModes = {};
            for (const [guildId, mode] of Object.entries(rawAutoplayModes)) {
                sanitizedAutoplayModes[guildId] = sanitizeAutoplayMode(mode);
            }
            stats.autoplayModesByGuild = sanitizedAutoplayModes;
            stats.autoplaySetByGuild = data.autoplaySetByGuild && typeof data.autoplaySetByGuild === "object"
                ? data.autoplaySetByGuild
                : {};
            stats.recentlyPlayed = data.recentlyPlayed || [];
            stats.errorCount = data.errorCount || 0;
            stats.guildActivity = data.guildActivity || {};
            stats.guildPlaytime = sanitizeNumericMap(data.guildPlaytime);
            stats.websiteGuildViews = sanitizeNumericMap(data.websiteGuildViews);
            stats.topArtists = data.topArtists || {};
            stats.commandErrors = data.commandErrors || [];
        }
    } catch (err) {
        console.error('Failed to load stats.json:', err.message);
    }
}

// Load user data (favorites and history)
async function loadUserData() {
    try {
        if (fs.existsSync(userDataPath)) {
            const data = JSON.parse(await fsp.readFile(userDataPath, 'utf8'));
            Object.assign(userData, data);
        }
    } catch (err) {
        console.error('Failed to load userdata.json:', err.message);
    }
}

// Save stats to file (async, non-blocking)
async function saveStats() {
    try {
        const data = {
            totalSongsPlayed: stats.totalSongsPlayed,
            totalPlaytime: stats.totalPlaytime,
            totalCommandsExecuted: stats.totalCommandsExecuted,
            twentyFourSevenServers: Array.from(stats.twentyFourSevenServers),
            autoplayServers: Array.from(stats.autoplayServers || []),
            autoplayModesByGuild: stats.autoplayModesByGuild || {},
            autoplaySetByGuild: stats.autoplaySetByGuild || {},
            recentlyPlayed: stats.recentlyPlayed,
            errorCount: stats.errorCount,
            guildActivity: stats.guildActivity,
            guildPlaytime: sanitizeNumericMap(stats.guildPlaytime),
            websiteGuildViews: sanitizeNumericMap(stats.websiteGuildViews),
            topArtists: stats.topArtists,
            commandErrors: stats.commandErrors.slice(-50), // Keep last 50 errors
            lastUpdated: new Date().toISOString()
        };
        await fsp.writeFile(statsPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to save stats.json:', err.message);
    }
}

// Save user data (favorites and history) - async, non-blocking
async function saveUserData() {
    try {
        await fsp.writeFile(userDataPath, JSON.stringify(userData, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to save userdata.json:', err.message);
    }
}

// Load playlists data
const playlistsPath = path.join(__dirname, 'playlists.json');
async function loadPlaylists() {
    try {
        if (fs.existsSync(playlistsPath)) {
            const data = JSON.parse(await fsp.readFile(playlistsPath, 'utf8'));
            global.playlists = data;
            console.log(`Loaded playlists for ${Object.keys(data).length} users`);
        } else {
            global.playlists = {};
            console.log('No playlists.json found - creating new...');
        }
    } catch (err) {
        console.error('Failed to load playlists.json:', err.message);
        global.playlists = {};
    }
}

// Export stats to global for access from commands (load in background)
Promise.all([loadStats(), loadUserData(), loadPlaylists()]).then(() => {
    console.log(`Loaded user and stats data in ${Date.now() - startupTime}ms`);
    // Clear 247 mode on restart
    const serversBefore = stats.twentyFourSevenServers.size;
    console.log(`Clearing 24/7 mode from ${serversBefore} server(s)...`);
    stats.twentyFourSevenServers.clear();
    console.log(`24/7 mode cleared - ${stats.twentyFourSevenServers.size} servers now enabled`);
    // Always reset autoplay after restart (manual opt-in each boot).
    const autoplayBefore = stats.autoplayServers.size;
    console.log(`Clearing autoplay mode from ${autoplayBefore} server(s)...`);
    stats.autoplayServers.clear();
    stats.autoplayModesByGuild = {};
    stats.autoplaySetByGuild = {};
    console.log("Autoplay reset complete - all servers are OFF");
    global.stats = stats;
    global.userData = userData;
    global.songHistory = songHistory;
}).catch(err => console.error('Error loading data:', err));

const client = new Client({
    intents: [
        "Guilds",
        "GuildMembers",
        "GuildMessages",
        "GuildVoiceStates",
        "GuildMessageReactions",
        "MessageContent",
        "DirectMessages",
    ],
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

// Load commands asynchronously in the background
function loadCommands() {
    try {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if (command.name) {
                if (advancedPremiumCommands.has(command.name)) {
                    command.premium = true;
                }

                // if premium enforcement is disabled, clean up any "(Premium Only)"
                // text in the description so the help output doesn't look misleading.
                if (!config.enforcePremium && typeof command.description === 'string') {
                    command.description = command.description.replace("(Premium Only)", "(currently free)");
                }
                client.commands.set(command.name, command);
            }
        }
        console.log(`Loaded ${client.commands.size} commands`);
    } catch (err) {
        console.error('Error loading commands:', err.message);
    }
}
loadCommands();


client.riffy = new Riffy(client, config.nodes, {
    send: (payload) => {
        const guild = client.guilds.cache.get(payload.d.guild_id);
        if (guild) guild.shard.send(payload);
    },
    defaultSearchPlatform: "ytsearch",
    restVersion: "v4"
});

// update on guild add/remove so site is more responsive
client.on('guildCreate', async (guild) => {
    // Fire and forget - don't block
    setImmediate(async () => {
        await writeWebsiteStatusSnapshot();
        await writeLiveServerStatsSnapshot();
    });

    let inviteReward = null;
    try {
        if (guild.ownerId) {
            inviteReward = growthUtils.grantInviteJoinTrialToken(guild.ownerId, guild.id);
        }
    } catch (error) {
        console.error("Failed to grant invite reward token:", error.message);
    }
    
    // Send DM to the server owner thanking them for adding the bot
    try {
        const owner = await guild.fetchOwner();
        const { EmbedBuilder } = require('discord.js');
        const rewardText = inviteReward?.granted
            ? `You received +${inviteReward.rewardTokens} trial token. Total tokens: ${inviteReward.trialTokens}.`
            : (inviteReward?.ok
                ? "Invite reward for this server was already claimed before."
                : "Could not process invite reward automatically right now.");

        const dmEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Thanks for adding Flute Music Bot!')
            .setDescription('Thanks for joining from bot! We\'re excited to have you. Type `f help` to see all available commands.')
            .addFields([
                {
                    name: 'Getting Started',
                    value: 'Use `f help` to view all commands'
                },
                {
                    name: 'Quick Start',
                    value: 'Try `f play [song name]` to start playing music!'
                },
                {
                    name: 'Invite Reward',
                    value: `${rewardText}\nUse \`ftrial status\` to check.`,
                    inline: false
                }
            ])
            .setTimestamp();
        
        await owner.send({ embeds: [dmEmbed] }).catch(err => console.error('Failed to send welcome DM:', err));
    } catch (error) {
        console.error('Failed to send welcome DM to server owner:', error);
    }
    
    // Send webhook notification when bot is added to server
    if (config.webhookUrl && config.webhookUrl.length > 10) {
        setImmediate(async () => {
            try {
                // Get server owner name
                let ownerName = 'Unknown';
                try {
                    // Use ownerId first, which is always available
                    if (guild.ownerId) {
                        const owner = client.users.cache.get(guild.ownerId);
                        ownerName = owner?.tag || `ID: ${guild.ownerId}`;
                    }
                } catch (e) {
                    console.log('Could not fetch owner details:', e.message);
                }
                
                // Get server invite
                let inviteUrl = 'N/A';
                try {
                    const invites = await guild.invites.fetch();
                    if (invites.size > 0) {
                        inviteUrl = invites.first().url;
                    } else {
                        // Try to create one
                        const firstChannel = guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me).has('CreateInvite'));
                        if (firstChannel) {
                            const invite = await firstChannel.createInvite({ maxAge: 0 });
                            inviteUrl = invite.url;
                        }
                    }
                } catch (e) {
                    console.error('Could not get/create invite:', e.message);
                }
                
                // Send webhook using axios
                const webhookData = {
                    username: 'Flute Music Bot',
                    embeds: [{
                        color: 65280, // Green
                        title: 'Bot Added to Server',
                        description: `**${guild.name}**`,
                        fields: [
                            {
                                name: 'Server Name',
                                value: `${guild.name}`,
                                inline: true
                            },
                            {
                                name: 'Total Members',
                                value: `${guild.memberCount}`,
                                inline: true
                            },
                            {
                                name: 'Server ID',
                                value: `${guild.id}`,
                                inline: true
                            },
                            {
                                name: 'Server Owner',
                                value: ownerName,
                                inline: true
                            },
                            {
                                name: 'Server Invite',
                                value: inviteUrl,
                                inline: false
                            }
                        ],
                        thumbnail: guild.icon ? { url: guild.iconURL({ dynamic: true, size: 512 }) } : undefined,
                        timestamp: new Date().toISOString()
                    }]
                };
                
                const response = await axios.post(config.webhookUrl, webhookData);
                console.log('Guild create webhook sent successfully');
            } catch (error) {
                console.error('Failed to send guild create webhook:', error.message);
                if (error.response) {
                    console.error('Webhook response status:', error.response.status);
                    console.error('Webhook response data:', error.response.data);
                }
            }
        });
    }
});
client.on('guildDelete', (guild) => {
    // Fire and forget - don't block
    setImmediate(async () => {
        await writeWebsiteStatusSnapshot();
        await writeLiveServerStatsSnapshot();
    });

    // Send webhook notification when bot is removed from a server
    if (config.webhookUrl) {
        setImmediate(async () => {
            try {
                const { WebhookClient, EmbedBuilder } = require('discord.js');
                const webhook = new WebhookClient({ url: config.webhookUrl });
                
                // Get server owner if available
                let ownerName = 'Unknown';
                try {
                    if (guild && guild.ownerId) {
                        const owner = await guild.fetchOwner();
                        ownerName = owner?.user?.tag || 'Unknown';
                    }
                } catch (e) {
                    console.error('Could not fetch owner:', e.message);
                }
                
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Bot Removed from Server')
                    .setDescription(`**${guild?.name || 'Unknown'}**`)
                    .addFields([
                        { name: 'Server Name', value: `${guild?.name || 'Unknown'}`, inline: true },
                        { name: 'Total Members', value: `${guild?.memberCount || 'Unknown'}`, inline: true },
                        { name: 'Server ID', value: `${guild?.id || 'Unknown'}`, inline: true },
                        { name: 'Server Owner', value: ownerName, inline: true }
                    ])
                    .setTimestamp();

                if (guild && guild.icon) {
                    embed.setThumbnail(guild.iconURL({ dynamic: true, size: 512 }));
                }

                webhook.send({ embeds: [embed] }).catch(err => console.error('Webhook error (guildDelete):', err));
            } catch (error) {
                console.error('Failed to send webhook (guildDelete):', error);
            }
        });
    }
});

client.on("messageCreate", async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Handle bot mentions
    if (message.mentions.has(client.user)) {
        const prefixes = Array.isArray(config.prefixes) ? config.prefixes : [config.prefix];
        const displayPrefix = prefixes.map(p => `\`${p}\``).join(' or ');
        const embed = new (require('discord.js')).EmbedBuilder()
            .setColor('#00ff0d')
            .setTitle('Flute Music Bot')
            .setDescription(`Hey ${message.author}! <a:infinity_hiiii:1474334458130731034> \n\nMy prefix is: ${displayPrefix}\n\nUse \`${prefixes[0]}help\` to see all available commands.`)
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // Command handling (support multiple prefixes)
    const prefixes = Array.isArray(config.prefixes) ? config.prefixes : [config.prefix];
    const matchedPrefix = prefixes.find(p => message.content.startsWith(p));
    if (!matchedPrefix) return;

    const args = message.content.slice(matchedPrefix.length).trim().split(" ").filter(Boolean);
    const rawCommandName = args.shift();
    if (!rawCommandName) return;
    const commandName = rawCommandName.toLowerCase();

    // Check if user is in a voice channel for music commands
    // Note: queue and nowplaying are informational - they don't require voice channel
    const musicCommands = ["play", "skip", "stop", "pause", "resume", "volume", "shuffle", "loop", "remove", "clear", "247"];
    if (musicCommands.includes(commandName)) {
        if (!message.member.voice.channel) {
            return messages.error(message.channel, "You must be in a voice channel!");
        }
    }

    // Get command from collection (support aliases)
    let command = client.commands.get(commandName);
    if (!command) {
        command = client.commands.find(c => c.aliases && c.aliases.includes(commandName));
    }
    if (!command) return;

    const userId = message.author.id;
    const ownerUser = isOwnerUser(userId);

    if (!ownerUser) {
        const rate = isUserRateLimited(userId);
        if (rate.blocked) {
            const retrySeconds = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
            return messages.error(
                message.channel,
                `You are sending commands too fast. Try again in ${retrySeconds}s.`
            );
        }
    }

    const cooldownMsRaw = Number(command.cooldownMs);
    const cooldownMs = Number.isFinite(cooldownMsRaw) && cooldownMsRaw >= 0
        ? cooldownMsRaw
        : COMMAND_DEFAULT_COOLDOWN_MS;

    if (!ownerUser && cooldownMs > 0) {
        const cooldownKey = `${userId}:${command.name}`;
        const nowMs = Date.now();
        const expiresAt = commandCooldowns.get(cooldownKey) || 0;

        if (expiresAt > nowMs) {
            const retrySeconds = Math.max(1, Math.ceil((expiresAt - nowMs) / 1000));
            return messages.error(
                message.channel,
                `Wait ${retrySeconds}s before using \`${matchedPrefix}${command.name}\` again.`
            );
        }

        commandCooldowns.set(cooldownKey, nowMs + cooldownMs);
    }

    try {
        if (command.premium && !coreFreeCommands.has(command.name)) {
            const premiumAllowed = await requirePremium(message);
            if (!premiumAllowed) return;
        }

        stats.totalCommandsExecuted++;
        await command.execute(message, args, client);
    } catch (error) {
        const errorId = `ERR-${Date.now().toString(36).toUpperCase()}`;
        stats.errorCount++;
        stats.commandErrors.push({
            errorId,
            command: commandName,
            error: error.message,
            userId: message.author.id,
            guildId: message.guild.id,
            timestamp: Date.now()
        });
        console.error(`[${errorId}]`, error);
        messages.error(
            message.channel,
            `Something went wrong while running \`${commandName}\`. Report ID: \`${errorId}\` (use \`freport ${errorId} <details>\`).`
        );
    }
});

client.riffy.on("nodeConnect", (node) => {
    console.log(`Node "${node.name}" connected.`);
});

client.riffy.on("nodeError", (node, error) => {
    console.log(`${emojis.error} Node "${node.name}" encountered an error: ${error.message}.`);
});

client.riffy.on("trackError", (player, track, error) => {
    console.error(`Track Error: ${track?.info?.title || 'Unknown'} - ${error.message}`);
    if (player.textChannel) {
        try {
            const textChannel = client.channels.cache.get(player.textChannel);
            if (textChannel) {
                textChannel.send(`Error playing **${track?.info?.title || 'Track'}**: ${error.message}`);
            }
        } catch (e) {
            console.error("Failed to send error message:", e.message);
        }
    }
});

client.riffy.on("trackStuck", (player, track, thresholdMs) => {
    console.warn(`Track Stuck: ${track?.info?.title || 'Unknown'} after ${thresholdMs}ms`);
    if (player.textChannel) {
        try {
            const textChannel = client.channels.cache.get(player.textChannel);
            if (textChannel) {
                textChannel.send(`Track stuck: **${track?.info?.title || 'Track'}**, skipping...`);
            }
        } catch (e) {
            console.error("Failed to send stuck message:", e.message);
        }
    }
});

// Helper: set voice channel "status"/topic to show now playing (if supported)
// (Persistent now-playing message removed)


client.on("raw", (d) => {
    if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
    client.riffy.updateVoiceState(d);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const guildId = interaction.guildId;
    const player = client.riffy.players.get(guildId);
    
    if (!player) return interaction.reply({ content: 'No active player.', flags: 64 });

    // Only allow users in voice channel to control
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member || !member.voice.channel) return interaction.reply({ content: 'You must be in a voice channel to use this.', flags: 64 });

    // Recommendation dropdown handling removed.

    if (!interaction.isButton()) return;

    if (interaction.customId === 'music_pause') {
        try {
            if (player.paused) {
                await player.pause(false);
                await interaction.reply({ content: 'Resumed playback.', flags: 64 });
                try { await messages.updateNowPlaying(client, player); } catch (e) {}
            } else {
                await player.pause(true);
                await interaction.reply({ content: 'Paused playback.', flags: 64 });
                try { await messages.updateNowPlaying(client, player); } catch (e) {}
            }
        } catch (err) {
            console.error('Pause error:', err);
            await interaction.reply({ content: 'Failed to toggle pause: ' + err.message, flags: 64 });
        }
    } else if (interaction.customId === 'music_skip') {
        try {
            // Get current track with fallbacks
            let currentTrack = null;
            if (player.queue && player.queue.current) {
                currentTrack = player.queue.current;
            } else if (player.current) {
                currentTrack = player.current;
            } else if (player.nowPlaying) {
                currentTrack = player.nowPlaying;
            }
            const skipped = currentTrack;
            try { await messages.clearNowPlaying(client, player); } catch (e) {}
            await player.stop();
            await interaction.reply({ content: `Skipped: **${skipped?.info?.title || 'Unknown'}**`, flags: 64 });
        } catch (err) {
            console.error('Skip error:', err);
            await interaction.reply({ content: 'Failed to skip: ' + err.message, flags: 64 });
        }
    } else if (interaction.customId === 'music_prev') {
        try {
            // Get history for this guild
            const history = songHistory[guildId];
            if (!history || history.length < 2) {
                return interaction.reply({ content: 'No previous track in history.', flags: 64 });
            }
            
            // Get the previous track (second to last, since last is current song)
            const previousSnapshot = history[history.length - 2];
            if (!previousSnapshot) {
                return interaction.reply({ content: 'No previous track.', flags: 64 });
            }

            let trackToPlay = previousSnapshot;
            if (!trackToPlay.track && !trackToPlay.encoded) {
                const previousUri = previousSnapshot.info?.uri;
                const previousTitle = previousSnapshot.info?.title || "Unknown";
                const fallbackQuery = previousUri || `${previousSnapshot.info?.title || ""} ${previousSnapshot.info?.author || ""}`;

                if (!fallbackQuery.trim()) {
                    return interaction.reply({ content: 'Previous song metadata missing.', flags: 64 });
                }

                const resolved = await client.riffy.resolve({
                    query: fallbackQuery,
                    requester: interaction.user
                }).catch(() => null);

                trackToPlay = resolved?.tracks?.[0] || null;
                if (!trackToPlay) {
                    return interaction.reply({ content: `Could not load previous track: **${previousTitle}**`, flags: 64 });
                }
            }

            // Remove the previous track from history
            history.splice(history.length - 2, 1);

            // Queue it and play
            player.queue.unshift(trackToPlay);
            player.stop();

            await interaction.reply({ content: `Playing previous: **${trackToPlay.info.title}**`, flags: 64 });
        } catch (err) {
            console.error('Previous error:', err);
            await interaction.reply({ content: 'Failed to play previous: ' + err.message, flags: 64 });
        }
    } else if (interaction.customId === 'music_shuffle') {
        try {
            if (!player.queue || player.queue.length < 2) {
                return interaction.reply({ content: 'Need at least 2 tracks to shuffle.', flags: 64 });
            }
            await player.queue.shuffle();
            await interaction.reply({ content: `Queue shuffled. **${player.queue.length}** tracks remaining.`, flags: 64 });
        } catch (err) {
            console.error('Shuffle error:', err);
            await interaction.reply({ content: 'Failed to shuffle: ' + err.message, flags: 64 });
        }
    } else if (interaction.customId === 'music_loop') {
        try {
            const currentMode = player.loop;
            const newMode = currentMode === 'none' ? 'queue' : 'none';
            if (typeof player.setLoop === 'function') {
                await player.setLoop(newMode);
            } else {
                player.loop = newMode;
            }
            await interaction.reply({ content: newMode === 'queue' ? 'Loop enabled for queue.' : 'Loop disabled.', flags: 64 });
            try { await messages.updateNowPlaying(client, player); } catch (e) {}
        } catch (err) {
            console.error('Loop toggle error:', err);
            await interaction.reply({ content: 'Failed to toggle loop: ' + err.message, flags: 64 });
        }
    } else if (interaction.customId === 'music_stop') {
    try {

        // Get voice channel safely
        const vc = client.channels.cache.get(player.voiceChannel);

        // Clear voice status first
        if (vc) {
            await setVoiceStatus(vc, null);
            console.log("Voice status cleared (stop button)");
        }

        // Destroy player after clearing
        if (player) {
            await player.destroy();
        }

        await interaction.reply({
            content: 'Stopped playback and left channel.',
            flags: 64
        });

    } catch (err) {
        console.error("Stop button error:", err);
        await interaction.reply({
            content: 'Failed to stop player.',
            flags: 64
        });
    }

} else if (interaction.customId === 'music_replay') {
        try {
            // Get current track with fallbacks
            let currentTrack = null;
            if (player.queue && player.queue.current) {
                currentTrack = player.queue.current;
            } else if (player.current) {
                currentTrack = player.current;
            } else if (player.nowPlaying) {
                currentTrack = player.nowPlaying;
            }
            
            if (!currentTrack) {
                return interaction.reply({ content: 'No track is currently playing.', flags: 64 });
            }
            
            // Seek to the beginning
            await player.seek(0);
            await interaction.reply({ content: `Replaying: **${currentTrack.info.title}**`, flags: 64 });
        } catch (err) {
            console.error('Replay error:', err);
            await interaction.reply({ content: 'Failed to replay: ' + err.message, flags: 64 });
        }
    
    } else if (interaction.customId === 'play_now_track') {
        try {
            // Get the current queue to find and move the requested track to front
            if (!player.queue || player.queue.length === 0) {
                return interaction.reply({ content: 'Queue is empty.', flags: 64 });
            }

            // Find the track that was just added (usually at position 0 or close to it)
            // Move first track in queue to play immediately
            const trackToPlay = player.queue[0];
            
            if (!trackToPlay) {
                return interaction.reply({ content: 'No track found in queue.', flags: 64 });
            }

            // Stop current playback and play the track
            await player.stop();
            
            await interaction.reply({ content: `Now playing: **${trackToPlay.info.title}**`, flags: 64 });
        } catch (err) {
            console.error('Play now error:', err);
            await interaction.reply({ content: 'Failed to play track: ' + err.message, flags: 64 });
        }
    }
});

client.on("guildMemberAdd", (member) => {
    console.log(`guildMemberAdd received: ${member.user.tag} (${member.id}) in ${member.guild.id}`);
    sendWelcomePoster(member).catch((error) => {
        console.error("Welcome poster handler failed:", error.message);
    });
});

// Send webhook notifications for member joins/leaves if configured (fire and forget)
if (config.webhookUrl && config.webhookUrl.length > 5) {
    client.on('guildMemberAdd', (member) => {
        // Don't await - fire and forget to avoid blocking
        axios.post(config.webhookUrl, {
            username: 'Flute Music - Join/Leave',
            embeds: [{
                title: 'Member Joined',
                description: `${member.user.tag} (${member.id}) joined **${member.guild.name}**`,
                color: 65280,
                timestamp: new Date().toISOString()
            }]
        }).catch(e => console.error('Webhook join failed', e.message));
    });

    client.on('guildMemberRemove', (member) => {
        // Don't await - fire and forget to avoid blocking
        axios.post(config.webhookUrl, {
            username: 'Flute Music - Join/Leave',
            embeds: [{
                title: 'Member Left',
                description: `${member.user.tag} (${member.id}) left **${member.guild.name}**`,
                color: 16711680,
                timestamp: new Date().toISOString()
            }]
        }).catch(e => console.error('Webhook leave failed', e.message));
    });
}





// ===============================
// VOICE STATUS SYSTEM
// ===============================

client.riffy.on("trackStart", async (player, track) => {
    try {
        await new Promise(r => setTimeout(r, 800));

        pushGuildSongHistory(player.guildId, track);
        recordTrackAnalytics(player.guildId, track);
        recordUserHistory(track);
        saveStats().catch(() => {});
        saveUserData().catch(() => {});
        player.autoCaptionText = "";
        player.autoCaptionLanguage = "";

        try {
            await messages.clearQueuedTrackNotice(client, player.guildId, track);
        } catch (queuedMsgError) {
            // Ignore cleanup failure.
        }

        const vc = client.channels.cache.get(player.voiceChannel);
        if (!vc) return;

        await setVoiceStatus(
            vc,
            `<a:playing:1473974241887256641> Playing: ${track.info.title}`
        );

        // Send Now Playing embed to the text channel
        if (player.textChannel) {
            const textChannel = await client.channels.fetch(player.textChannel).catch(() => null);
            if (textChannel && textChannel.isTextBased?.()) {
                try {
                    // Ensure previous track embed is removed immediately on song change.
                    await messages.clearNowPlaying(client, player);
                    await messages.nowPlaying(textChannel, track, player, client);
                } catch (e) {
                    console.error('Failed to send Now Playing embed:', e.message);
                }
            }
        }

        if (autoCaption.isEnabled() && player.textChannel) {
            const startTrackFingerprint = getTrackFingerprint(track);
            setImmediate(async () => {
                try {
                    const caption = await autoCaption.buildTrackCaption(track);
                    if (!caption || !caption.text) return;

                    const currentTrack = player?.queue?.current || player?.current || player?.nowPlaying || null;
                    const currentTrackFingerprint = getTrackFingerprint(currentTrack);
                    if (
                        startTrackFingerprint &&
                        currentTrackFingerprint &&
                        startTrackFingerprint !== currentTrackFingerprint
                    ) {
                        return;
                    }

                    player.autoCaptionText = caption.text;
                    player.autoCaptionLanguage = caption.targetLang || autoCaption.getTargetLanguage().toUpperCase();
                    await messages.updateNowPlaying(client, player);
                } catch (captionError) {
                    console.error("Auto caption failed:", captionError.message);
                }
            });
        }

        console.log(`Voice status updated -> ${track.info.title}`);
    } catch (err) {
        console.error("Voice status update failed:", err.message);
    }
});

client.riffy.on("queueEnd", async (player) => {
    try {
        player.autoCaptionText = "";
        player.autoCaptionLanguage = "";

        // Remove the old now-playing embed when the current song/queue finishes.
        try { await messages.clearNowPlaying(client, player); } catch (e) {}
        try { messages.clearQueuedTrackNoticesForGuild(player.guildId); } catch (e) {}

        let vc = client.channels.cache.get(player.voiceChannel);
        if (!vc && player.voiceChannel) {
            vc = await client.channels.fetch(player.voiceChannel).catch(() => null);
        }

        if (vc) {
            await setVoiceStatus(vc, null);
            console.log("Voice status cleared (queue ended)");
        }

        const autoplayEnabled = Boolean(
            stats.autoplayServers &&
            stats.autoplayServers.has(player.guildId)
        );

        if (autoplayEnabled) {
            const guildHistory = songHistory[player.guildId] || [];
            const seedTrack = guildHistory[guildHistory.length - 1] || null;
            const autoplayMode = getGuildAutoplayMode(player.guildId);
            const restrictedAutoplayModes = new Set(["similar", "artist", "random"]);
            let autoplayAllowed = true;

            if (restrictedAutoplayModes.has(autoplayMode)) {
                const autoplayOwnerId = String(stats.autoplaySetByGuild?.[player.guildId] || "").trim();
                const ownerHasPremium = autoplayOwnerId ? paymentUtils.isPremium(autoplayOwnerId) : false;
                const ownerReferral = autoplayOwnerId
                    ? growthUtils.getReferralPassStatus(autoplayOwnerId)
                    : { hasAccess: false, expiresAt: null, expiryNotifiedFor: null };

                autoplayAllowed = ownerHasPremium || ownerReferral.hasAccess;

                if (!autoplayAllowed) {
                    stats.autoplayServers.delete(player.guildId);
                    delete stats.autoplayModesByGuild[player.guildId];
                    delete stats.autoplaySetByGuild[player.guildId];

                    const textChannel = player.textChannel
                        ? (
                            client.channels.cache.get(player.textChannel) ||
                            await client.channels.fetch(player.textChannel).catch(() => null)
                        )
                        : null;

                    if (textChannel && textChannel.isTextBased?.()) {
                        const accessEmbed = new EmbedBuilder()
                            .setColor("#FFB300")
                            .setTitle("Autoplay Disabled")
                            .setDescription("Restricted autoplay mode stopped because referral weekly pass/premium is inactive.")
                            .addFields(
                                { name: "Join Server", value: config.supportURL || "Support link not configured", inline: false }
                            )
                            .setTimestamp();
                        await textChannel.send({ embeds: [accessEmbed] }).catch(() => {});
                    }

                    if (
                        autoplayOwnerId &&
                        ownerReferral.expiresAt &&
                        ownerReferral.expiryNotifiedFor !== ownerReferral.expiresAt
                    ) {
                        const ownerUser = await client.users.fetch(autoplayOwnerId).catch(() => null);
                        if (ownerUser) {
                            await ownerUser.send({
                                content:
                                    `Your weekly referral pass expired on ${new Date(ownerReferral.expiresAt).toLocaleString()}.\n` +
                                    "Restricted autoplay mode has been turned off."
                            }).catch(() => {});
                        }
                        growthUtils.markReferralPassExpiryNotified(autoplayOwnerId, ownerReferral.expiresAt);
                    }
                }
            }

            if (autoplayAllowed && seedTrack) {
                try {
                    const nextTrack = await resolveAutoplayTrack(client, player, seedTrack, autoplayMode);
                    if (nextTrack) {
                        // Autoplay should never repeat the finished queue by loop.
                        if (player.loop === "queue") {
                            if (typeof player.setLoop === "function") {
                                player.setLoop("none");
                            } else {
                                player.loop = "none";
                            }
                        }

                        // Ensure ended tracks are not replayed before autoplay suggestion.
                        if (player.queue) {
                            if (typeof player.queue.clear === "function") {
                                player.queue.clear();
                            } else if (Array.isArray(player.queue)) {
                                player.queue.length = 0;
                            }
                        }

                        nextTrack.info.requester = seedTrack.info.requester || client.user;
                        player.queue.add(nextTrack);
                        await player.play();

                        console.log(`Autoplay (${autoplayMode}) started in guild ${player.guildId}`);
                        return;
                    }
                } catch (autoplayError) {
                    console.error("Autoplay resolve failed:", autoplayError.message);
                }
            }
        }

        // Check if 24/7 mode is enabled
        if (!player.twentyFourSeven) {
            // 24/7 disabled - leave voice channel
            try {
                // Send goodbye embed to text channel
                const textChannel = client.channels.cache.get(player.textChannel);
                if (textChannel) {
                    const { EmbedBuilder } = require('discord.js');
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('<a:bye_bye:1475217491759206421>  im leaving voice channel...')
                        .setDescription('songs completed, queue ended ... see you next time boi boiiiiii...')
                        .setTimestamp();
                    
                    await textChannel.send({ embeds: [embed] });
                }
                
                await player.destroy();
                console.log("Bot left voice channel (queue ended, 24/7 disabled)");
            } catch (e) {
                console.error("Error destroying player on queue end:", e.message);
            }
        } else {
            console.log("24/7 mode enabled - bot staying in voice channel");
        }
    } catch {}
});

client.riffy.on("playerDestroy", async (player) => {
    try {
        player.autoCaptionText = "";
        player.autoCaptionLanguage = "";
        try { messages.clearQueuedTrackNoticesForGuild(player.guildId); } catch (e) {}

        const vc = client.channels.cache.get(player.voiceChannel);
        if (!vc) return;

        await setVoiceStatus(vc, null);
        console.log("Voice status cleared (player destroyed)");
    } catch {}
});
// When queue finishes

// ===============================
// SAFE CLEAR FUNCTION
// ===============================


client.on("voiceStateUpdate", async (oldState, newState) => {
    // only watch the bot itself
    if (oldState.id !== client.user.id) return;

    // bot LEFT a voice channel
    if (oldState.channelId && !newState.channelId) {
        try {
            await setVoiceStatus(oldState.channel, null);
            console.log("Voice status cleared (bot disconnected)");
        } catch (err) {
            console.error("Failed to clear voice status:", err.message);
        }
    }
});
// LOGIN MUST BE LAST


global.discordClient = client;


// Initialize Express server for website
const app = express();
const port = process.env.PORT || 10000;
let razorpayClient = null;

function timingSafeHexEqual(left, right) {
    if (!left || !right) {
        return false;
    }

    const a = Buffer.from(left, "utf8");
    const b = Buffer.from(right, "utf8");

    if (a.length !== b.length) {
        return false;
    }

    return crypto.timingSafeEqual(a, b);
}

function getRazorpayClient() {
    if (razorpayClient) {
        return razorpayClient;
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new Error("RAZORPAY_NOT_CONFIGURED");
    }

    razorpayClient = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    return razorpayClient;
}

function isLikelyDiscordId(userId) {
    return /^[0-9]{15,22}$/.test(String(userId || "").trim());
}

const premiumPlans = listPlans();

function toNonNegativeNumber(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return 0;
    }
    return numericValue;
}

function getGuildListenedMs(guildId) {
    const directPlaytimeMs = toNonNegativeNumber(stats.guildPlaytime?.[guildId]);
    if (directPlaytimeMs > 0) {
        return directPlaytimeMs;
    }

    const playedTracks = toNonNegativeNumber(stats.guildActivity?.[guildId]);
    const totalSongs = toNonNegativeNumber(stats.totalSongsPlayed);
    const totalPlaytimeMs = toNonNegativeNumber(stats.totalPlaytime);
    if (playedTracks <= 0 || totalSongs <= 0 || totalPlaytimeMs <= 0) {
        return 0;
    }

    // Real fallback from existing counters: average track length * played tracks.
    const averageTrackMs = totalPlaytimeMs / totalSongs;
    return Math.round(averageTrackMs * playedTracks);
}

function getGuildPlaybackStatus(guildId, playedTracks) {
    const playerStore = client?.riffy?.players;
    const hasLivePlayer = Boolean(
        playerStore && (
            (typeof playerStore.has === "function" && playerStore.has(guildId)) ||
            (typeof playerStore.get === "function" && playerStore.get(guildId))
        )
    );

    if (hasLivePlayer) return "Playing Now";
    if (playedTracks > 0) return "Active";
    return "Idle";
}

function buildLiveServerStatsPayload({ incrementViews = true } = {}) {
    const guilds = Array.from(client.guilds.cache.values());
    const safeViews = sanitizeNumericMap(stats.websiteGuildViews);
    stats.websiteGuildViews = safeViews;
    const defaultServerLogo = getDefaultServerLogo();

    const servers = guilds.map((guild) => {
        const guildId = String(guild.id);
        const played = toNonNegativeNumber(stats.guildActivity?.[guildId]);
        const listenedMs = getGuildListenedMs(guildId);
        const previousViews = toNonNegativeNumber(safeViews[guildId]);
        const updatedViews = incrementViews ? previousViews + 1 : previousViews;

        if (incrementViews) {
            stats.websiteGuildViews[guildId] = updatedViews;
        }

        return {
            guildId,
            name: guild.name || "Unknown Server",
            logo: guild.iconURL({ dynamic: true, size: 256 }) || defaultServerLogo,
            played,
            listeningHours: Number((listenedMs / 3600000).toFixed(2)),
            views: updatedViews,
            status: getGuildPlaybackStatus(guildId, played),
            memberCount: toNonNegativeNumber(guild.memberCount)
        };
    }).sort((left, right) => {
        return right.played - left.played || right.memberCount - left.memberCount;
    });

    const liveMembers = guilds.reduce((sum, guild) => sum + toNonNegativeNumber(guild.memberCount), 0);
    const totalServerViews = Object.values(stats.websiteGuildViews).reduce((sum, value) => {
        return sum + toNonNegativeNumber(value);
    }, 0);

    return {
        success: true,
        updatedAt: new Date().toISOString(),
        servers,
        platform: {
            totalSongsPlayed: toNonNegativeNumber(stats.totalSongsPlayed),
            totalListeningHours: Number((toNonNegativeNumber(stats.totalPlaytime) / 3600000).toFixed(2)),
            totalCommandsExecuted: toNonNegativeNumber(stats.totalCommandsExecuted),
            totalServerViews,
            activeServers: guilds.length,
            liveServers: guilds.length,
            liveMembers
        }
    };
}

async function writeWebsiteStatusSnapshot() {
    try {
        await fsp.writeFile(
            websiteStatusPath,
            JSON.stringify({
                servers: client.guilds.cache.size,
                members: client.users.cache.size,
                updated: new Date().toISOString()
            }, null, 2),
            "utf8"
        );
    } catch {
        // Ignore website status file errors.
    }
}

async function writeLiveServerStatsSnapshot() {
    try {
        const payload = buildLiveServerStatsPayload({ incrementViews: false });
        await fsp.writeFile(websiteLiveStatsPath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
        // Ignore snapshot write errors.
    }
}

// Razorpay webhook route must receive raw payload
app.use(
    "/webhook",
    express.raw({ type: "application/json" }),
    webhookRoutes
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/api/topgg-vote", async (req, res) => {
    try {
        if (!getTopggAuthToken()) {
            return res.status(503).json({ success: false, error: "TOPGG_TOKEN is not configured" });
        }

        if (!isTopggAuthorized(req)) {
            return res.status(401).json({ success: false, error: "Unauthorized vote webhook" });
        }

        const payload = req.body || {};
        const userId = String(payload.user || payload.id || "").trim();
        if (!isLikelyDiscordId(userId)) {
            return res.status(400).json({ success: false, error: "Invalid Discord user ID" });
        }

        const weekendVote = isWeekendVote(payload);
        const reward = growthUtils.grantVoteTrialToken(userId, { isWeekend: weekendVote });

        setImmediate(() => {
            sendVoteThanks(client, userId, reward, payload).catch((error) => {
                console.error("Auto thank voter failed:", error.message);
            });
        });

        return res.json({
            success: true,
            rewarded: Boolean(reward?.granted),
            rewardTokens: Number(reward?.rewardTokens || 0),
            trialTokens: Number(reward?.trialTokens || 0),
            reason: reward?.reason || "OK"
        });
    } catch (error) {
        console.error("Top.gg vote webhook failed:", error.message);
        return res.status(500).json({ success: false, error: "Vote webhook failed" });
    }
});

app.get("/api/live-server-stats", (req, res) => {
    try {
        const trackViews = String(req.query.trackViews ?? "1").trim() !== "0";
        const payload = buildLiveServerStatsPayload({ incrementViews: trackViews });
        saveStats().catch(() => {});
        writeWebsiteStatusSnapshot().catch(() => {});
        writeLiveServerStatsSnapshot().catch(() => {});
        return res.json(payload);
    } catch (error) {
        console.error("Live server stats failed:", error.message);
        return res.status(500).json({ success: false, error: "Failed to fetch live server stats" });
    }
});

app.get("/api/premium-plans", (req, res) => {
    const plans = Object.fromEntries(
        Object.entries(premiumPlans).map(([key, value]) => [
            key,
            {
                key: value.key,
                label: value.label,
                amount: value.amount,
                amountInRupees: (value.amount / 100).toFixed(2),
                currency: value.currency,
                description: value.description
            }
        ])
    );

    return res.json({
        success: true,
        testMode: isTestAmountEnabled(),
        plans
    });
});

app.post("/api/create-order", async (req, res) => {
    try {
        const { plan, userId, userEmail } = req.body || {};
        const selectedPlan = String(plan || "monthly").trim().toLowerCase();

        if (!premiumPlans[selectedPlan]) {
            return res.status(400).json({ success: false, error: "Invalid plan" });
        }

        if (!isLikelyDiscordId(userId)) {
            return res.status(400).json({ success: false, error: "Valid Discord ID is required" });
        }

        const clientForPayment = getRazorpayClient();
        const planData = premiumPlans[selectedPlan];
        const receipt = `rcpt_${Date.now()}_${String(userId).slice(-6)}`;

        const order = await clientForPayment.orders.create({
            amount: planData.amount,
            currency: planData.currency,
            receipt,
            notes: {
                discord_id: String(userId),
                userId: String(userId),
                email: userEmail || "",
                plan: selectedPlan
            }
        });

        return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error("Create order failed:", error.message);
        const isConfigError = error.message === "RAZORPAY_NOT_CONFIGURED";
        return res.status(500).json({
            success: false,
            error: isConfigError
                ? "Razorpay is not configured on server"
                : "Failed to create order"
        });
    }
});

app.post("/api/verify-payment", async (req, res) => {
    try {
        const {
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature
        } = req.body || {};

        if (!orderId || !paymentId || !signature) {
            return res.status(400).json({ success: false, error: "Missing payment verification fields" });
        }

        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(500).json({ success: false, error: "Razorpay key secret is missing" });
        }

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        if (!timingSafeHexEqual(signature, expectedSignature)) {
            return res.status(400).json({ success: false, error: "Invalid payment signature" });
        }

        const clientForPayment = getRazorpayClient();
        const payment = await clientForPayment.payments.fetch(paymentId);
        const paymentNotes = payment.notes || {};
        let mergedNotes = { ...paymentNotes };
        let userId = paymentNotes.discord_id || paymentNotes.userId || paymentNotes.user_id;

        if (!isLikelyDiscordId(userId) && payment.order_id) {
            try {
                const order = await clientForPayment.orders.fetch(payment.order_id);
                const orderNotes = order?.notes || {};
                mergedNotes = { ...orderNotes, ...mergedNotes };
                userId = orderNotes.discord_id || orderNotes.userId || orderNotes.user_id;
            } catch (error) {
                console.warn("Unable to fetch order notes in verify-payment:", error.message);
            }
        }

        if (!isLikelyDiscordId(userId) && payment.subscription_id) {
            try {
                const subscription = await clientForPayment.subscriptions.fetch(payment.subscription_id);
                const subNotes = subscription?.notes || {};
                mergedNotes = { ...subNotes, ...mergedNotes };
                userId = subNotes.discord_id || subNotes.userId || subNotes.user_id;
            } catch (error) {
                console.warn("Unable to fetch subscription notes in verify-payment:", error.message);
            }
        }

        if (!isLikelyDiscordId(userId)) {
            return res.status(400).json({ success: false, error: "Payment does not include a valid Discord ID" });
        }

        const resolvedUserId = String(userId).trim();
        const resolvedEmail = payment.email || mergedNotes.email || "";
        const resolvedPlan = normalizePlan(mergedNotes.plan);

        const premiumUser = paymentUtils.addPremiumUser(
            resolvedUserId,
            resolvedEmail,
            resolvedPlan,
            payment.id,
            payment.amount
        );

        if (global.discordClient) {
            await syncPremiumRoleForUser(global.discordClient, resolvedUserId, true);
        }

        if (process.env.WEBHOOK_URL) {
            webhookNotifier.notifyNewPremium(
                process.env.WEBHOOK_URL,
                resolvedUserId,
                resolvedEmail,
                premiumUser.plan,
                payment.amount
            ).catch((err) => {
                console.error("Premium webhook notify failed:", err.message);
            });
        }

        return res.json({
            success: true,
            message: "Payment verified and premium activated",
            plan: premiumUser.plan,
            expiresAt: premiumUser.expiresAt
        });
    } catch (error) {
        console.error("Verify payment failed:", error.message);
        return res.status(500).json({ success: false, error: "Payment verification failed" });
    }
});

app.get("/api/premium-stats", (req, res) => {
    try {
        const statsData = paymentUtils.getPremiumStats();
        return res.json({ success: true, stats: statsData });
    } catch (error) {
        console.error("Premium stats failed:", error.message);
        return res.status(500).json({ success: false, error: "Failed to fetch premium stats" });
    }
});

app.get("/api/premium-log", (req, res) => {
    try {
        const users = paymentUtils.getAllPremiumUsers();
        const log = Object.entries(users).map(([userId, user]) => ({
            userId,
            email: user.email || "",
            plan: user.plan || "monthly",
            status: user.isActive ? "Active" : "Inactive",
            purchasedAt: user.purchasedAt,
            expiresAt: user.expiresAt || "Never (Lifetime)"
        }));

        log.sort((left, right) => {
            return new Date(right.purchasedAt || 0) - new Date(left.purchasedAt || 0);
        });

        return res.json({
            success: true,
            totalRecords: log.length,
            log
        });
    } catch (error) {
        console.error("Premium log failed:", error.message);
        return res.status(500).json({ success: false, error: "Failed to fetch premium log" });
    }
});

app.post("/api/webhook-premium-users", async (req, res) => {
    try {
        const statsData = paymentUtils.getPremiumStats();
        const sent = await webhookNotifier.notifyPremiumStats(
            process.env.WEBHOOK_URL,
            statsData
        );

        return res.json({ success: sent });
    } catch (error) {
        console.error("Premium webhook stats failed:", error.message);
        return res.status(500).json({ success: false, error: "Webhook failed" });
    }
});

app.use(express.static(path.join(__dirname, "website")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "website", "index.html"));
});

app.get("/premium", (req, res) => {
    res.sendFile(path.join(__dirname, "website", "premium.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "website", "premium-dashboard.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "website", "login.html"));
});

app.get("/profile", (req, res) => {
    res.sendFile(path.join(__dirname, "website", "profile.html"));
});

app.get("/manage-premiums", (req, res) => {
    res.sendFile(path.join(__dirname, "website", "manage-premiums.html"));
});

app.listen(port, () => {
    console.log(`✅ Website server listening on port ${port}`);
});


async function shutdown() {
    console.log("✅ Shutting down bot properly...");

    try {
        await saveStats().catch(() => {});
        await saveUserData().catch(() => {});

        // Clear voice status in all guilds
        for (const guild of client.guilds.cache.values()) {
            const vc = guild.members.me?.voice?.channel;
            if (vc) {
                await setVoiceStatus(vc, null);
                console.log(`✅ Cleared voice status in ${guild.name}`);
            }
        }

        // Destroy players
        if (client.riffy) {
            client.riffy.players.forEach(player => {
                try { player.destroy(); } catch {}
            });
        }

        // Clear intervals
        activeIntervals.forEach(i => clearInterval(i));

        // Disconnect bot
        await client.destroy();

        console.log("✅ Bot disconnected cleanly");

    } catch (err) {
        console.error("Shutdown error:", err);
    }

    process.exit(0);
}

client.login(config.botToken);

client.once("clientReady", async () => {

    const readyTime = Date.now() - startupTime;

    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`✅ Bot ready in ${readyTime}ms`);

    // Global access for webhook
    global.discordClient = client;

    // Start Lavalink
    client.riffy.init(client.user.id);

    // Status rotator
    const statusInterval = statusRotator.initializeStatusRotator(client);
    activeIntervals.push(statusInterval);

    writeWebsiteStatusSnapshot().catch(() => {});
    writeLiveServerStatsSnapshot().catch(() => {});

    // Single-message uptime monitor (edits same embed on every restart/update)
    const uptimeInterval = startUptimeReporter(client);
    if (uptimeInterval) {
        activeIntervals.push(uptimeInterval);
    }

    const persistenceInterval = setInterval(() => {
        const nowMs = Date.now();

        for (const [key, expiresAt] of commandCooldowns.entries()) {
            if (expiresAt <= nowMs) {
                commandCooldowns.delete(key);
            }
        }

        for (const [userId, unblockAt] of temporarilyBlockedUsers.entries()) {
            if (unblockAt <= nowMs) {
                temporarilyBlockedUsers.delete(userId);
            }
        }

        for (const [userId, times] of userCommandWindows.entries()) {
            const keep = times.filter((ts) => ts > (nowMs - SPAM_WINDOW_MS));
            if (keep.length === 0) userCommandWindows.delete(userId);
            else userCommandWindows.set(userId, keep);
        }

        saveStats().catch(() => {});
        saveUserData().catch(() => {});
        writeWebsiteStatusSnapshot().catch(() => {});
        writeLiveServerStatsSnapshot().catch(() => {});
    }, 60 * 1000);
    activeIntervals.push(persistenceInterval);

    // Premium systems
    startPremiumExpiryChecker(client);
    startupPremiumSync(client);

    console.log("Premium systems initialized");

});
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
/////client.once('ready', async () => {
  ///console.log(`Logged in as ${client.user.tag}`);

 /// await client.application.commands.set([]);
 /// console.log("Cleared all global commands.");

 /// process.exit();
//});
