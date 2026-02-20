const { Client, GatewayDispatchEvents, Collection, ActivityType } = require("discord.js");
const express = require('express');

const config = require("./config.js");
const { Riffy } = require('riffy');
const messages = require("./utils/messages.js");
const emojis = require("./emojis.js");
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

// Export stats to global for access from commands (load in background)
Promise.all([loadStats(), loadUserData()]).then(() => {
    console.log(`✅ Loaded user and stats data in ${Date.now() - startupTime}ms`);
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

client.on("ready", () => {
    const readyTime = Date.now() - startupTime;
    try {
        client.riffy.init(client.user.id);
        console.log(`${emojis.success} Logged in as ${client.user.tag}`);
        console.log(`⚡ Bot ready in ${readyTime}ms`);
    } catch (error) {
        console.error(`${emojis.error} Failed to initialize Riffy:`, error.message);
    }

    // Define statuses to rotate
    const statuses = [
        { 
            name: 'Music Stream 🎵', 
            type: ActivityType.Streaming, 
              // <-- Replace with your Twitch channel URL
        },
        { 
            name: 'f help | Music', 
            type: ActivityType.Watching 
        },
        {
            name: `Music on ${client.guilds.cache.size} servers`,
            type: ActivityType.Playing
        }
    ];
    let statusIndex = 0;

    // Set initial presence
    client.user.setPresence({
        activities: [statuses[statusIndex]],
        status: 'online'
    });

    // Rotate presence every 10 seconds
    const statusInterval = setInterval(() => {
        statusIndex = (statusIndex + 1) % statuses.length;
        client.user.setPresence({
            activities: [statuses[statusIndex]],
            status: 'online'
        });
    }, 10000);
    activeIntervals.push(statusInterval);

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
    
    // Send webhook notification when bot is added to server
    if (config.webhookUrl) {
        try {
            const { WebhookClient, EmbedBuilder } = require('discord.js');
            const webhook = new WebhookClient({ url: config.webhookUrl });
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Bot Added to Server')
                .setDescription(`**${guild.name}**`)
                .addFields([
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
                    }
                ])
                .setTimestamp();
            
            // Set thumbnail if guild has an icon
            if (guild.icon) {
                embed.setThumbnail(guild.iconURL({ dynamic: true, size: 512 }));
            }

            webhook.send({ embeds: [embed] }).catch(err => console.error('Webhook error:', err));
        } catch (error) {
            console.error('Failed to send webhook:', error);
        }
    }
});
client.on('guildDelete', (guild) => {
    // Fire and forget - don't block
    setImmediate(async () => {
        try { await fsp.writeFile(path.join(__dirname, 'website', 'status.json'), JSON.stringify({ servers: client.guilds.cache.size, members: client.users.cache.size, updated: new Date().toISOString() }, null, 2), 'utf8'); } catch(e){/*ignore*/}
    });

    // Send webhook notification when bot is removed from a server
    if (config.webhookUrl) {
        try {
            const { WebhookClient, EmbedBuilder } = require('discord.js');
            const webhook = new WebhookClient({ url: config.webhookUrl });
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Bot Removed from Server')
                .setDescription(`**${guild?.name || 'Unknown'}**`)
                .addFields([
                    { name: '🏢 Server Name', value: `${guild?.name || 'Unknown'}`, inline: true },
                    { name: '👥 Total Members', value: `${guild?.memberCount || 'Unknown'}`, inline: true },
                    { name: '🆔 Server ID', value: `${guild?.id || 'Unknown'}`, inline: true }
                ])
                .setTimestamp();

            if (guild && guild.icon) {
                embed.setThumbnail(guild.iconURL({ dynamic: true, size: 512 }));
            }

            webhook.send({ embeds: [embed] }).catch(err => console.error('Webhook error (guildDelete):', err));
        } catch (error) {
            console.error('Failed to send webhook (guildDelete):', error);
        }
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
    const musicCommands = ["play", "skip", "stop", "pause", "resume", "queue", "nowplaying", "volume", "shuffle", "loop", "remove", "clear", "autoplay", "247"];
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
    console.log(`${emojis.success} Node "${node.name}" connected.`);
});

client.riffy.on("nodeError", (node, error) => {
    console.log(`${emojis.error} Node "${node.name}" encountered an error: ${error.message}.`);
});

client.riffy.on("nodeDisconnect", (node) => {
    console.log(`${emojis.error} Node "${node.name}" disconnected. Attempting to reconnect...`);
});

client.riffy.on("trackStart", async (player, track) => {
    try {
        const channel = client.channels.cache.get(player.textChannel);
        if (!channel) {
            console.error(`${emojis.error} Text channel not found for track start event`);
            return;
        }
        messages.nowPlaying(channel, track, player);
    } catch (error) {
        console.error(`${emojis.error} Error in trackStart event:`, error.message);
        return;
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
    
    // Store track info for autoplay mode to find similar tracks
    player.lastTrackInfo = {
        title: track.info.title,
        author: track.info.author,
        uri: track.info.uri
    };
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
});

// Helper: set voice channel "status"/topic to show now playing (if supported)
// (Persistent now-playing message removed)

client.riffy.on("queueEnd", async (player) => {
    const channel = client.channels.cache.get(player.textChannel);
    
    // Handle 24/7 mode - keeps the player active and adds a random song
    if (player.twentyFourSeven) {
        try {
            const searchTerms = ["lofi", "chill", "ambient", "relaxing music", "study music"];
            const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
            const resolve = await client.riffy.resolve({
                query: randomTerm,
                requester: client.user,
            });

            if (resolve.tracks && resolve.tracks.length > 0) {
                const bannedAutoplayKeywords = ['sleep','sleep music','deep sleep','sleep sounds','sleeping','bedtime','insomnia','asleep','nap','meditation'];
                const isUnwanted = (info) => {
                    const text = ((info.title || '') + ' ' + (info.author || '')).toLowerCase();
                    for (const k of bannedAutoplayKeywords) if (text.includes(k)) return true;
                    return false;
                };

                const track = resolve.tracks.find(t => !isUnwanted(t.info)) || resolve.tracks[0];
                track.info.requester = client.user;
                player.queue.add(track);
                player.play();
                messages.success(channel, "🎵 24/7 Mode: Added a random track to keep the music going!");
                return;
            }
        } catch (error) {
            console.error("Error adding track for 24/7 mode:", error);
        }
    }
    
    // Handle autoplay mode - adds similar songs when queue ends
    if (player.autoplay) {
        try {
            // Helper: detect simple language hints from title/author (e.g., Telugu)
            const detectLanguageFromText = (title, author) => {
                const text = ((title || '') + ' ' + (author || '')).toLowerCase();
                const langs = ['telugu','tamil','hindi','kannada','malayalam','bengali','punjabi','urdu','english','spanish','portuguese','french','german'];
                // detect by script (Telugu block) or explicit language name
                if (/[\u0C00-\u0C7F]/.test(text)) return 'telugu';
                for (const l of langs) if (text.includes(l)) return l;
                return '';
            };
            // Only run autoplay if there are non-bot users in the voice channel
            const voiceChannel = client.channels.cache.get(player.voiceChannel);
            const humanCount = voiceChannel ? voiceChannel.members.filter(m => !m.user.bot).size : 0;
            if (humanCount === 0) {
                // No human users present — skip autoplay so bot doesn't keep playing for no one.
            } else {
                const bannedAutoplayKeywords = ['sleep','sleep music','deep sleep','sleep sounds','sleeping','bedtime','insomnia','asleep','nap','meditation'];
                const isUnwanted = (info) => {
                    const text = ((info.title || '') + ' ' + (info.author || '')).toLowerCase();
                    for (const k of bannedAutoplayKeywords) if (text.includes(k)) return true;
                    return false;
                };
                // If we have info about the last track, try to find similar tracks
                if (player.lastTrackInfo) {
                    const langHint = detectLanguageFromText(player.lastTrackInfo.title, player.lastTrackInfo.author);
                    const baseQuery = `${player.lastTrackInfo.title} ${player.lastTrackInfo.author}`;
                    const query = (langHint ? `${player.lastTrackInfo.title} ${langHint}` : baseQuery).slice(0, 200);
                    const resolve = await client.riffy.resolve({ query, requester: client.user });

                    if (resolve && resolve.tracks && resolve.tracks.length > 0) {
                        // pick the first track that isn't the same URI and isn't unwanted (sleep/meditation)
                        const candidate = resolve.tracks.find(t => t.info.uri !== player.lastTrackInfo.uri && !isUnwanted(t.info))
                            || resolve.tracks.find(t => !isUnwanted(t.info))
                            || resolve.tracks[0];
                        if (candidate) {
                            candidate.info.requester = client.user;
                            player.queue.add(candidate);
                            player.play();
                            messages.success(channel, '🤖 Autoplay: Added a similar track to the queue.');
                            return;
                        }
                    }
                }

                // Fallback: if no lastTrackInfo or no similar track found, pick a random chill/popular term
                const searchTerms = ["lofi", "chill", "ambient", "relaxing music", "study music", "top tracks", "trending"];
                const langHint = player.lastTrackInfo ? detectLanguageFromText(player.lastTrackInfo.title, player.lastTrackInfo.author) : '';
                const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
                const resolve = await client.riffy.resolve({
                    query: (langHint ? `${randomTerm} ${langHint}` : randomTerm),
                    requester: client.user,
                });

                if (resolve.tracks && resolve.tracks.length > 0) {
                    const track = resolve.tracks.find(t => !isUnwanted(t.info)) || resolve.tracks[0];
                    track.info.requester = client.user;
                    player.queue.add(track);
                    player.play();
                    messages.success(channel, '🤖 Autoplay: Added a track to keep the music going.');
                    return;
                }
            }
        } catch (error) {
            console.error("Error adding track for autoplay mode:", error);
        }
    }
    
    
    player.destroy();
    messages.queueEnded(channel);
});

client.on("raw", (d) => {
    if (![GatewayDispatchEvents.VoiceStateUpdate, GatewayDispatchEvents.VoiceServerUpdate].includes(d.t)) return;
    client.riffy.updateVoiceState(d);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const guildId = interaction.guildId;
    const player = client.riffy.players.get(guildId);
    if (!player) return interaction.reply({ content: 'No active player.', ephemeral: true });

    // Only allow users in voice channel to control
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member || !member.voice.channel) return interaction.reply({ content: 'You must be in a voice channel to use this.', ephemeral: true });

    if (interaction.customId === 'music_pause') {
        try {
            if (player.paused) {
                player.pause(false);
                await interaction.reply({ content: 'Resumed playback.', ephemeral: true });
            } else {
                player.pause(true);
                await interaction.reply({ content: 'Paused playback.', ephemeral: true });
            }
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'Failed to toggle pause.', ephemeral: true });
        }
    } else if (interaction.customId === 'music_prev') {
        try {
            // Move to previous track by removing current and replaying queue
            if (player.queue.length > 0) {
                player.stop();
                await interaction.reply({ content: 'Playing previous track.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'No previous track available.', ephemeral: true });
            }
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'Failed to play previous track.', ephemeral: true });
        }
    } else if (interaction.customId === 'music_skip') {
        try {
            player.stop();
            await interaction.reply({ content: 'Skipped track.', ephemeral: true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'Failed to skip.', ephemeral: true });
        }
    } else if (interaction.customId === 'music_shuffle') {
        try {
            if (player.queue.length === 0) {
                return interaction.reply({ content: 'Not enough tracks to shuffle!', ephemeral: true });
            }
            player.queue.shuffle();
            await interaction.reply({ content: `Queue shuffled! **${player.queue.length}** tracks remaining.`, ephemeral: true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'Failed to shuffle queue.', ephemeral: true });
        }
    } else if (interaction.customId === 'music_stop') {
        try {
            player.destroy();
            await interaction.reply({ content: 'Stopped playback and left channel.', ephemeral: true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: 'Failed to stop player.', ephemeral: true });
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