const { Client, GatewayDispatchEvents, Collection, ActivityType } = require("discord.js");
const express = require('express');

const config = require("./config.js");
const { Riffy } = require('riffy');
const messages = require("./utils/messages.js");
const emojis = require("./emojis.js");
const statusRotator = require("./utils/statusRotator.js");
const fs = require("fs");
const path = require("path");
const fsp = require('fs').promises;
const axios = require('axios');

// Startup performance monitoring
const startupTime = Date.now();
console.log('🚀 Bot startup started...');

// Store interval IDs for cleanup on shutdown
const activeIntervals = [];

// Bot stats tracking
const stats = {
    totalSongsPlayed: 0,
    startTime: Date.now(),
    totalPlaytime: 0,
    totalCommandsExecuted: 0,
    twentyFourSevenServers: new Set(),
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
            console.log(`✅ Loaded playlists for ${Object.keys(data).length} users`);
        } else {
            global.playlists = {};
            console.log('📂 No playlists.json found - creating new...');
        }
    } catch (err) {
        console.error('Failed to load playlists.json:', err.message);
        global.playlists = {};
    }
}

// Export stats to global for access from commands (load in background)
Promise.all([loadStats(), loadUserData(), loadPlaylists()]).then(() => {
    console.log(`✅ Loaded user and stats data in ${Date.now() - startupTime}ms`);
    // Clear 247 mode on restart
    const serversBefore = stats.twentyFourSevenServers.size;
    console.log(`🔄 Clearing 24/7 mode from ${serversBefore} server(s)...`);
    stats.twentyFourSevenServers.clear();
    console.log(`✅ 24/7 mode cleared - ${stats.twentyFourSevenServers.size} servers now enabled`);
    global.stats = stats;
    global.userData = userData;
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
                client.commands.set(command.name, command);
            }
        }
        console.log(`✅ Loaded ${client.commands.size} commands`);
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
    defaultSearchPlatform: "ytmsearch",
    restVersion: "v4",
    plugins: []
});

client.on("clientReady", () => {
    const readyTime = Date.now() - startupTime;
    try {
        client.riffy.init(client.user.id);
        console.log(`${emojis.success} Logged in as ${client.user.tag}`);
        console.log(`⚡ Bot ready in ${readyTime}ms`);
    } catch (error) {
        console.error(`${emojis.error} Failed to initialize Riffy:`, error.message);
    }



    // Write initial website status and schedule periodic updates
    async function updateWebsiteStatus() {
        try {
            const statusPath = path.join(__dirname, 'website', 'status.json');
            const uptime = Date.now() - stats.startTime;
            const uptimeHours = Math.floor(uptime / 3600000);
            const uptimeMinutes = Math.floor((uptime % 3600000) / 60000);
            
            // Calculate error rate
            const errorRate = stats.totalCommandsExecuted > 0 
                ? (stats.errorCount / stats.totalCommandsExecuted * 100).toFixed(2) 
                : 0;
            
            // Get top 5 guilds by activity
            const topGuilds = Object.entries(stats.guildActivity)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([guildId, count]) => ({
                    guildId,
                    songCount: count,
                    guildName: client.guilds.cache.get(guildId)?.name || 'Unknown'
                }));
            
            // Get top 10 artists
            const topArtists = Object.entries(stats.topArtists)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([artist, count]) => ({ name: artist, count }));
            
            const data = {
                servers: client.guilds.cache.size,
                members: client.users.cache.size,
                totalSongsPlayed: stats.totalSongsPlayed,
                totalPlaytime: stats.totalPlaytime,
                totalCommandsExecuted: stats.totalCommandsExecuted,
                botUptime: `${uptimeHours}h ${uptimeMinutes}m`,
                uptimeSeconds: uptime,
                twentyFourSevenServers: stats.twentyFourSevenServers.size,
                errorCount: stats.errorCount,
                errorRate: parseFloat(errorRate),
                recentlyPlayed: stats.recentlyPlayed.slice(0, 10),
                topGuilds: topGuilds,
                topArtists: topArtists,
                updated: new Date().toISOString()
            };
            await fsp.writeFile(statusPath, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
            console.error('Failed to write website/status.json', err);
        }
    }

    // Defer website status update to avoid blocking startup
    setImmediate(() => updateWebsiteStatus().catch(() => { }));
    const websiteInterval = setInterval(() => updateWebsiteStatus().catch(() => { }), 5 * 60 * 1000);
    activeIntervals.push(websiteInterval);

    // Save stats and user data every minute (fire and forget, non-blocking)
    const statsInterval = setInterval(() => {
        saveStats().catch(() => { });
        saveUserData().catch(() => { });
    }, 60 * 1000);
    activeIntervals.push(statsInterval);
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
            .setTitle('🎵 Thanks for adding Flute Music Bot!')
            .setDescription('Thanks for joining from bot! We\'re excited to have you. Type `f help` to see all available commands.')
            .addFields([
                {
                    name: '🎧 Getting Started',
                    value: 'Use `f help` to view all commands'
                },
                {
                    name: '🎯 Quick Start',
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
                        title: '✅ Bot Added to Server',
                        description: `**${guild.name}**`,
                        fields: [
                            {
                                name: '🏢 Server Name',
                                value: `${guild.name}`,
                                inline: true
                            },
                            {
                                name: '👥 Total Members',
                                value: `${guild.memberCount}`,
                                inline: true
                            },
                            {
                                name: '🆔 Server ID',
                                value: `${guild.id}`,
                                inline: true
                            },
                            {
                                name: '👤 Server Owner',
                                value: ownerName,
                                inline: true
                            },
                            {
                                name: '🔗 Server Invite',
                                value: inviteUrl,
                                inline: false
                            }
                        ],
                        thumbnail: guild.icon ? { url: guild.iconURL({ dynamic: true, size: 512 }) } : undefined,
                        timestamp: new Date().toISOString()
                    }]
                };
                
                const response = await axios.post(config.webhookUrl, webhookData);
                console.log('✅ Guild create webhook sent successfully');
            } catch (error) {
                console.error('❌ Failed to send guild create webhook:', error.message);
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
                    .setTitle('❌ Bot Removed from Server')
                    .setDescription(`**${guild?.name || 'Unknown'}**`)
                    .addFields([
                        { name: '🏢 Server Name', value: `${guild?.name || 'Unknown'}`, inline: true },
                        { name: '👥 Total Members', value: `${guild?.memberCount || 'Unknown'}`, inline: true },
                        { name: '🆔 Server ID', value: `${guild?.id || 'Unknown'}`, inline: true },
                        { name: '👤 Server Owner', value: ownerName, inline: true }
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
            .setTitle('🎵 Flute Music Bot')
            .setDescription(`Hey ${message.author}! <a:infinity_hiiii:1474334458130731034> \n\nMy prefix is: ${displayPrefix}\n\nUse \`${prefixes[0]}help\` to see all available commands.`)
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
        return message.reply({ embeds: [embed] });
    }

    // Command handling (support multiple prefixes)
    const prefixes = Array.isArray(config.prefixes) ? config.prefixes : [config.prefix];
    const matchedPrefix = prefixes.find(p => message.content.startsWith(p));
    if (!matchedPrefix) return;

    const args = message.content.slice(matchedPrefix.length).trim().split(" ");
    const commandName = args.shift().toLowerCase();

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

    try {
        stats.totalCommandsExecuted++;
        await command.execute(message, args, client);
    } catch (error) {
        stats.errorCount++;
        stats.commandErrors.push({
            command: commandName,
            error: error.message,
            userId: message.author.id,
            guildId: message.guild.id,
            timestamp: Date.now()
        });
        console.error(error);
        messages.error(message.channel, "An error occurred while executing that command!");
    }
});

client.riffy.on("nodeConnect", (node) => {
    console.log(`✅ Node "${node.name}" connected.`);
});

client.riffy.on("nodeError", (node, error) => {
    console.log(`${emojis.error} Node "${node.name}" encountered an error: ${error.message}.`);
});

client.riffy.on("nodeDisconnect", (node) => {
    console.log(`${emojis.error} Node "${node.name}" disconnected. Attempting to reconnect...`);
});

client.riffy.on("trackStart", async (player, track) => {
    try {
        if (!player || !track) {
            console.error(`${emojis.error} Invalid player or track in trackStart event`);
            return;
        }
        
        const channel = client.channels.cache.get(player.textChannel);
        if (!channel) {
            console.error(`${emojis.error} Text channel not found for track start event`);
            return;
        }
        
        // Send now playing message for every track (not just first)
        try {
            await messages.nowPlaying(channel, track, player, client).catch(err => {
                console.error(`${emojis.error} Failed to send now playing message:`, err.message);
            });
        } catch (err) {
            console.error(`${emojis.error} Exception in nowPlaying:`, err.message);
        }
    } catch (error) {
        console.error(`${emojis.error} Error in trackStart event:`, error.message);
        return;
    }
    
    // Add current track to song history (keep last 50 songs)
    if (!songHistory[player.guildId]) {
        songHistory[player.guildId] = [];
    }
    songHistory[player.guildId].push(track);
    if (songHistory[player.guildId].length > 50) {
        songHistory[player.guildId].shift();
    }
    
    // Track song play and playtime
    stats.totalSongsPlayed++;
    if (track.info.length) {
        stats.totalPlaytime += track.info.length;
    }
    
    // Track recently played (keep last 20)
    stats.recentlyPlayed.unshift({
        title: track.info.title,
        author: track.info.author,
        uri: track.info.uri,
        requester: track.info.requester?.id || 'Unknown',
        timestamp: Date.now(),
        guildId: player.guildId
    });
    if (stats.recentlyPlayed.length > 20) {
        stats.recentlyPlayed.pop();
    }
    
    // Track guild activity
    stats.guildActivity[player.guildId] = (stats.guildActivity[player.guildId] || 0) + 1;
    
    // Track top artists
    const artist = track.info.author || 'Unknown';
    stats.topArtists[artist] = (stats.topArtists[artist] || 0) + 1;
    
    // Track user history
    const requesterID = track.info.requester?.id;
    if (requesterID) {
        if (!userData[requesterID]) {
            userData[requesterID] = { favorites: [], history: [] };
        }
        userData[requesterID].history.unshift({
            title: track.info.title,
            author: track.info.author,
            uri: track.info.uri,
            timestamp: Date.now()
        });
        // Keep last 100 songs in history
        if (userData[requesterID].history.length > 100) {
            userData[requesterID].history.pop();
        }
    }
    
    // Clear any previous queueEnd handling flag so future queueEnd can be processed
    try { player._handledQueueEnd = false; } catch (e) { /* ignore */ }
    // Update the text channel topic/status to show current playing track
    try {
        if (channel && typeof channel.setTopic === 'function') {
            const requester = track.info.requester?.tag || 'Unknown';
            const title = track.info.title || 'Unknown';
            const author = track.info.author ? ` - ${track.info.author}` : '';
            const topic = `Now Playing: ${title}${author} | Requested by: ${requester}`;
            channel.setTopic(topic.slice(0, 1024)).catch(() => {});
        }
    } catch (e) { /* ignore topic set errors */ }
    
    // Update bot presence to show currently playing song
    try {
        const songTitle = (track.info.title || 'Unknown').slice(0, 100);
        client.user.setPresence({
            activities: [{
                name: `🎵 ${songTitle}`,
                type: 2  // Listening activity
            }],
            status: "online"
        }).catch(err => {
            console.log('Failed to update presence:', err.message);
        });
    } catch (e) { /* ignore presence errors */ }
});

// Helper: set voice channel "status"/topic to show now playing (if supported)
// (Persistent now-playing message removed)

client.riffy.on("queueEnd", async (player) => {
    const channel = client.channels.cache.get(player.textChannel);
    // Prevent destruction if bot just joined
    if (player._justJoined) {
        console.log("Bot just joined - ignoring queueEnd");
        return;
    }
    // Prevent duplicate handling when multiple rapid events (skip/stop) fire
    if (player._handledQueueEnd) return;
    player._handledQueueEnd = true;
    
    // Handle 24/7 mode - keeps the bot in VC but doesn't add songs
    if (player.twentyFourSeven) {
        console.log("24/7 mode active - bot staying in voice channel");
        return;
    }
    
    // Clear bot presence when queue ends
    try {
        client.user.setPresence({
            activities: [],
            status: "idle"
        }).catch(() => {});
    } catch (e) { /* ignore */ }
    
    player.destroy();
    messages.queueEnded(channel);
});

client.on("raw", (d) => {
    if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
    client.riffy.updateVoiceState(d);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const guildId = interaction.guildId;
    const player = client.riffy.players.get(guildId);
    
    if (!player) return interaction.reply({ content: '❌ No active player.', flags: 64 });

    // Only allow users in voice channel to control
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member || !member.voice.channel) return interaction.reply({ content: '❌ You must be in a voice channel to use this.', flags: 64 });

    // Recommendation dropdown handling removed.

    if (!interaction.isButton()) return;

    if (interaction.customId === 'music_pause') {
        try {
            if (player.paused) {
                await player.pause(false);
                await interaction.reply({ content: '▶️ Resumed playback.', flags: 64 });
                try { await messages.updateNowPlaying(client, player); } catch (e) {}
            } else {
                await player.pause(true);
                await interaction.reply({ content: '⏸️ Paused playback.', flags: 64 });
                try { await messages.updateNowPlaying(client, player); } catch (e) {}
            }
        } catch (err) {
            console.error('Pause error:', err);
            await interaction.reply({ content: '❌ Failed to toggle pause: ' + err.message, flags: 64 });
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
            await interaction.reply({ content: `⏭️ Skipped: **${skipped?.info?.title || 'Unknown'}**`, flags: 64 });
        } catch (err) {
            console.error('Skip error:', err);
            await interaction.reply({ content: '❌ Failed to skip: ' + err.message, flags: 64 });
        }
    } else if (interaction.customId === 'music_prev') {
        try {
            // Get history for this guild
            const history = songHistory[guildId];
            if (!history || history.length < 2) {
                return interaction.reply({ content: '❌ No previous track in history!', flags: 64 });
            }
            
            // Get the previous track (second to last, since last is current song)
            const prevTrack = history[history.length - 2];
            if (!prevTrack) {
                return interaction.reply({ content: '❌ No previous track!', flags: 64 });
            }
            
            // Remove the previous track from history
            history.splice(history.length - 2, 1);
            
            // Queue it and play
            player.queue.unshift(prevTrack);
            player.stop();
            
            await interaction.reply({ content: `⏮️ Playing previous: **${prevTrack.info.title}**`, flags: 64 });
        } catch (err) {
            console.error('Previous error:', err);
            await interaction.reply({ content: '❌ Failed to play previous: ' + err.message, flags: 64 });
        }
    } else if (interaction.customId === 'music_shuffle') {
        try {
            if (!player.queue || player.queue.length < 2) {
                return interaction.reply({ content: '🔀 Need at least 2 tracks to shuffle!', flags: 64 });
            }
            await player.queue.shuffle();
            await interaction.reply({ content: `🔀 Queue shuffled! **${player.queue.length}** tracks remaining.`, flags: 64 });
        } catch (err) {
            console.error('Shuffle error:', err);
            await interaction.reply({ content: '❌ Failed to shuffle: ' + err.message, flags: 64 });
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
            await interaction.reply({ content: newMode === 'queue' ? '🔁 Loop enabled for queue.' : '🔂 Loop disabled.', flags: 64 });
            try { await messages.updateNowPlaying(client, player); } catch (e) {}
        } catch (err) {
            console.error('Loop toggle error:', err);
            await interaction.reply({ content: '❌ Failed to toggle loop: ' + err.message, flags: 64 });
        }
    } else if (interaction.customId === 'music_stop') {
        try {
            // delete now-playing message first if present
            try { await messages.clearNowPlaying(client, player); } catch (e) {}
            await player.destroy();
            await interaction.reply({ content: '⏹️ Stopped playback and left channel.', flags: 64 });
        } catch (err) {
            console.error('Stop error:', err);
            await interaction.reply({ content: '❌ Failed to stop: ' + err.message, flags: 64 });
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
                return interaction.reply({ content: '❌ No track is currently playing!', flags: 64 });
            }
            
            // Seek to the beginning
            await player.seek(0);
            await interaction.reply({ content: `🔄 Replaying: **${currentTrack.info.title}**`, flags: 64 });
        } catch (err) {
            console.error('Replay error:', err);
            await interaction.reply({ content: '❌ Failed to replay: ' + err.message, flags: 64 });
        }
    
    } else if (interaction.customId === 'play_now_track') {
        try {
            // Get the current queue to find and move the requested track to front
            if (!player.queue || player.queue.length === 0) {
                return interaction.reply({ content: '❌ Queue is empty!', flags: 64 });
            }

            // Find the track that was just added (usually at position 0 or close to it)
            // Move first track in queue to play immediately
            const trackToPlay = player.queue[0];
            
            if (!trackToPlay) {
                return interaction.reply({ content: '❌ No track found in queue!', flags: 64 });
            }

            // Stop current playback and play the track
            await player.stop();
            
            await interaction.reply({ content: `▶️ Now playing: **${trackToPlay.info.title}**`, flags: 64 });
        } catch (err) {
            console.error('Play now error:', err);
            await interaction.reply({ content: '❌ Failed to play track: ' + err.message, flags: 64 });
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
                title: '👤 Member Joined',
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
                title: '🚪 Member Left',
                description: `${member.user.tag} (${member.id}) left **${member.guild.name}**`,
                color: 16711680,
                timestamp: new Date().toISOString()
            }]
        }).catch(e => console.error('Webhook leave failed', e.message));
    });
}

// Initialize status rotator
let statusInterval = null;
client.on('ready', () => {
    statusInterval = statusRotator.initializeStatusRotator(client);
    activeIntervals.push(statusInterval);
    console.log('✅ Status rotator initialized');
});

client.login(config.botToken);

// Initialize Express server for website
const app = express();
const port = process.env.PORT || 10000;

// Serve static files from the website directory
app.use(express.static(path.join(__dirname, 'website')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'index.html'));
});

// Start the Express server
app.listen(port, () => {
  console.log(`🌐 Website server listening on port ${port}`);
});


async function shutdown() {
    console.log("${emojis.success} Shutting down bot properly...");

    try {
        // Clear all active intervals
        activeIntervals.forEach(interval => {
            try {
                clearInterval(interval);
            } catch (e) {
                console.log("Interval clear error:", e.message);
            }
        });
        activeIntervals.length = 0;
        console.log("${emojis.success} All intervals cleared");

        // Destroy all players
        if (client.riffy) {
            client.riffy.players.forEach(player => {
                try {
                    player.destroy();
                } catch (e) {
                    console.log("Player destroy error:", e.message);
                }
            });
        }

        await client.destroy(); // properly disconnect from Discord
        console.log("${emojis.success} Bot disconnected from Discord");
    } catch (err) {
        console.error("${emojis.error} Shutdown error:", err);
    }

    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/////client.once('ready', async () => {
  ///console.log(`Logged in as ${client.user.tag}`);

 /// await client.application.commands.set([]);
 /// console.log("Cleared all global commands.");

 /// process.exit();
//});
