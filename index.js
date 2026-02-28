const { Client, GatewayDispatchEvents, Collection, ActivityType } = require("discord.js");
const express = require('express');
const crypto = require("crypto");
const Razorpay = require("razorpay");
const webhookRoutes = require("./server/webhook");
const config = require("./config.js");
const { Riffy } = require('riffy');
const messages = require("./utils/messages.js");
const emojis = require("./emojis.js");
const setVoiceStatus = require('./utils/voiceStatus');
const statusRotator = require("./utils/statusRotator.js");
const { requirePremium } = require("./utils/requirePremium");
const paymentUtils = require("./utils/paymentUtils");
const webhookNotifier = require("./utils/webhookNotifier");
const { listPlans, normalizePlan, isTestAmountEnabled } = require("./utils/premiumPlans");
const { syncPremiumRoleForUser } = require("./premium/roleSystem");
const fs = require("fs");
const path = require("path");
const fsp = require('fs').promises;
const axios = require('axios');
const { startPremiumExpiryChecker } =
require("./premium/premiumScheduler");
const { startupPremiumSync } =
require("./premium/startupSync");

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
    recentlyPlayed: [], // Last 20 songs
    errorCount: 0,
    guildActivity: {}, // {guildId: songCount}
    topArtists: {}, // {artistName: count}
    commandErrors: [] // Track command errors
};

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

    stats.totalSongsPlayed += 1;
    stats.totalPlaytime += Number(track.info.length) || 0;
    stats.guildActivity[guildId] = (stats.guildActivity[guildId] || 0) + 1;

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

async function resolveAutoplayTrack(client, player, seedTrack) {
    if (!seedTrack || !seedTrack.info) return null;

    const title = String(seedTrack.info.title || "").trim();
    const author = String(seedTrack.info.author || "").trim();

    if (!title) return null;

    const query = [title, author, "official audio"].filter(Boolean).join(" ").trim();
    const requester = seedTrack.info.requester || client.user;

    const sources = ["ytmsearch", "ytsearch"];
    let resolvedTracks = [];

    for (const source of sources) {
        try {
            const result = await client.riffy.resolve({ query, source, requester });
            if (result?.tracks?.length) {
                resolvedTracks = result.tracks;
                break;
            }
        } catch (error) {
            // Ignore a source failure and continue fallback.
        }
    }

    if (!resolvedTracks.length) {
        return null;
    }

    const seedFingerprint = getTrackFingerprint(seedTrack);
    const current = player?.queue?.current || player?.current || player?.nowPlaying || null;

    for (const candidate of resolvedTracks) {
        const candidateFingerprint = getTrackFingerprint(candidate);
        if (!candidateFingerprint) continue;
        if (candidateFingerprint === seedFingerprint) continue;
        if (current && sameTrack(candidate, current)) continue;
        return candidate;
    }

    return null;
}
// Core playback/info commands should always remain freely accessible (no premium/vote lock).
const coreFreeCommands = new Set([
    "help", "ping", "play", "pause", "resume", "skip", "stop", "queue",
    "nowplaying", "volume", "loop", "shuffle", "seek", "remove", "clearqueue",
    "clear", "replay"
]);

const advancedPremiumCommands = new Set([
    "247",
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
            stats.recentlyPlayed = data.recentlyPlayed || [];
            stats.errorCount = data.errorCount || 0;
            stats.guildActivity = data.guildActivity || {};
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
            recentlyPlayed: stats.recentlyPlayed,
            errorCount: stats.errorCount,
            guildActivity: stats.guildActivity,
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
    global.stats = stats;
    global.userData = userData;
    global.songHistory = songHistory;
}).catch(err => console.error('Error loading data:', err));

const client = new Client({
    intents: [
        "Guilds",
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
        try { await fsp.writeFile(path.join(__dirname, 'website', 'status.json'), JSON.stringify({ servers: client.guilds.cache.size, members: client.users.cache.size, updated: new Date().toISOString() }, null, 2), 'utf8'); } catch(e){/*ignore*/}
    });
    
    // Send DM to the server owner thanking them for adding the bot
    try {
        const owner = await guild.fetchOwner();
        const { EmbedBuilder } = require('discord.js');
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
        try { await fsp.writeFile(path.join(__dirname, 'website', 'status.json'), JSON.stringify({ servers: client.guilds.cache.size, members: client.users.cache.size, updated: new Date().toISOString() }, null, 2), 'utf8'); } catch(e){/*ignore*/}
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
                    await messages.nowPlaying(textChannel, track, player, client);
                } catch (e) {
                    console.error('Failed to send Now Playing embed:', e.message);
                }
            }
        }

        console.log(`Voice status updated -> ${track.info.title}`);
    } catch (err) {
        console.error("Voice status update failed:", err.message);
    }
});

client.riffy.on("queueEnd", async (player) => {
    try {
        const vc = client.channels.cache.get(player.voiceChannel);
        if (!vc) return;

        await setVoiceStatus(vc, null);
        console.log("Voice status cleared (queue ended)");

        const autoplayEnabled = Boolean(
            stats.autoplayServers &&
            stats.autoplayServers.has(player.guildId)
        );

        if (autoplayEnabled) {
            const guildHistory = songHistory[player.guildId] || [];
            const seedTrack = guildHistory[guildHistory.length - 1] || null;

            if (seedTrack) {
                try {
                    const nextTrack = await resolveAutoplayTrack(client, player, seedTrack);
                    if (nextTrack) {
                        nextTrack.info.requester = seedTrack.info.requester || client.user;
                        player.queue.add(nextTrack);
                        await player.play();

                        if (player.textChannel) {
                            const textChannel = client.channels.cache.get(player.textChannel);
                            if (textChannel) {
                                textChannel.send(
                                    `Autoplay added: **${nextTrack.info.title}** by **${nextTrack.info.author}**`
                                ).catch(() => {});
                            }
                        }

                        console.log(`Autoplay started in guild ${player.guildId}`);
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

// Razorpay webhook route must receive raw payload
app.use(
    "/webhook",
    express.raw({ type: "application/json" }),
    webhookRoutes
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.listen(port, () => {
    console.log(`Website server listening on port ${port}`);
});


async function shutdown() {
    console.log("Shutting down bot properly...");

    try {
        await saveStats().catch(() => {});
        await saveUserData().catch(() => {});

        // Clear voice status in all guilds
        for (const guild of client.guilds.cache.values()) {
            const vc = guild.members.me?.voice?.channel;
            if (vc) {
                await setVoiceStatus(vc, null);
                console.log(`Cleared voice status in ${guild.name}`);
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

        console.log("Bot disconnected cleanly");

    } catch (err) {
        console.error("Shutdown error:", err);
    }

    process.exit(0);
}

client.login(config.botToken);

client.once("clientReady", async () => {

    const readyTime = Date.now() - startupTime;

    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot ready in ${readyTime}ms`);

    // Global access for webhook
    global.discordClient = client;

    // Start Lavalink
    client.riffy.init(client.user.id);

    // Status rotator
    const statusInterval = statusRotator.initializeStatusRotator(client);
    activeIntervals.push(statusInterval);

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
