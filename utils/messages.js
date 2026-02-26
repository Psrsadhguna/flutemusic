// @ts-nocheck - file uses dynamic JS patterns; disable TS checks here
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const emojis = require('../emojis.js');
const config = require('../config.js');
const buttonUtils = require('./buttons.js');

// Recommendation engine removed

// URL validation function
function isValidURL(string) {
    try { new URL(string); return true; } catch (e) { return false; }
}

// Create help button
function createHelpButton() {
    const url = config.websiteURL || config.helpURL || '';
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
                .setEmoji(emojis.supportserver || '<:supportserver:1475873585468936295> ')
        );
    }
    
    // Vote button
    if (config.voteURL && isValidURL(config.voteURL)) {
        components.push(
            new ButtonBuilder()
                .setLabel('Vote')
                .setStyle(ButtonStyle.Link)
                .setURL(config.voteURL)
                .setEmoji('<:vote_fm:1476442039972401213>')
        );
    }

    // Website button
    if (config.websiteURL && isValidURL(config.websiteURL)) {
        components.push(
            new ButtonBuilder()
                .setLabel('Website')
                .setStyle(ButtonStyle.Link)
                .setURL(config.websiteURL)
                .setEmoji('<:website:1475873526522056746>')
        );
    }

    // Return an ActionRowBuilder containing the buttons, or null if none
    if (components.length > 0) {
        return new ActionRowBuilder().addComponents(...components);
    }
    return null;
}

// Basic embed helpers
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

// Duration formatter helper
function formatDuration(ms) {
    if (ms === undefined || ms === null) return 'N/A';
    if (ms === 'Infinity' || ms === Infinity) return 'Live';
    const msec = Number(ms) || 0;
    if (msec <= 0) return '0:00';
    const seconds = Math.floor((msec / 1000) % 60);
    const minutes = Math.floor((msec / (1000 * 60)) % 60);
    const hours = Math.floor(msec / (1000 * 60 * 60));
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getDurationString(track) {
    try {
        if (!track) return 'N/A';
        const len = track.info && (track.info.length || track.info.duration) ? (track.info.length || track.info.duration) : (track.length || null);
        return formatDuration(len);
    } catch (e) {
        return 'N/A';
    }
}

// Update the existing now-playing message for a player (if one exists)
async function updateNowPlaying(client, player) {
    try {
        if (!player || !player.nowPlayingMessage) return;
        const ref = player.nowPlayingMessage;
        if (!ref || !ref.channelId || !ref.messageId) return;
        const channel = await client.channels.fetch(ref.channelId).catch(() => null);
        if (!channel || !channel.isTextBased?.()) return;

        // Determine current track
        let currentTrack = null;
        if (player.queue && player.queue.current) {
            currentTrack = player.queue.current;
        } else if (player.current) {
            currentTrack = player.current;
        } else if (player.nowPlaying) {
            currentTrack = player.nowPlaying;
        }
        if (!currentTrack) {
            // Nothing to show; remove old message
            try { const old = await channel.messages.fetch(ref.messageId).catch(() => null); if (old) await old.delete().catch(() => {}); } catch (e) {}
            player.nowPlayingMessage = null;
            return;
        }

        // Send a fresh nowPlaying message and delete the previous one
        const newMsg = await module.exports.nowPlaying(channel, currentTrack, player, client).catch(() => null);
        try {
            const old = await channel.messages.fetch(ref.messageId).catch(() => null);
            if (old && (!newMsg || old.id !== newMsg.id)) await old.delete().catch(() => {});
        } catch (e) {}
        if (newMsg) player.nowPlayingMessage = { channelId: channel.id, messageId: newMsg.id };
    } catch (e) {
        // silently ignore
    }
}

async function clearNowPlaying(client, player) {
    try {
        if (!player || !player.nowPlayingMessage) return;
        const ref = player.nowPlayingMessage;
        const channel = await client.channels.fetch(ref.channelId).catch(() => null);
        if (channel) {
            try { const msg = await channel.messages.fetch(ref.messageId).catch(() => null); if (msg) await msg.delete().catch(() => {}); } catch (e) {}
        }
        player.nowPlayingMessage = null;
    } catch (e) {
        // ignore
    }
}

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
    nowPlaying: async (channel, track, player, client) => {
        try {
            if (!track || !track.info) {
                return channel.send({ content: '❌ No valid track information available' });
            }

            // recommendations removed

            const createProgressBar = (position, length, isStream) => {
                if (!position || !length || isStream) return '';
                
                const barLength = 15;
                const filledLength = Math.round((position / length) * barLength);
                const emptyLength = barLength - filledLength;
                
                const filled = '<a:green_fm:1476445115005534230>'.repeat(filledLength);
                const empty = '<a:red_fm:1476444450258682131>'.repeat(emptyLength);
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

            const playPauseLabel = (player && player.paused) ? 'Play' : 'Pause';
            const loopOnInitial = (player && player.loop === 'queue');
            const loopLabelInitial = loopOnInitial ? 'Loop: On' : 'Loop: Off';

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('music_prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.previous),
                    new ButtonBuilder()
                        .setCustomId('music_pause')
                        .setLabel(playPauseLabel)
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.pause),
                    new ButtonBuilder()
                        .setCustomId('music_skip')
                        .setLabel('Skip')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.skip),
                    new ButtonBuilder()
                        .setCustomId('music_loop')
                        .setLabel(loopLabelInitial)
                        .setStyle(loopOnInitial ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setEmoji(emojis.repeat),
                    new ButtonBuilder()
                        .setCustomId('music_shuffle')
                        .setLabel('Shuffle')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emojis.shuffle)
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
            
            // Recommendation dropdown has been removed.
            
            // Use provided client or fallback to channel.client
            const clientInstance = client || channel?.client;
            
            try {
                console.log('📤 Sending now-playing message...');
                const msg = await channel.send({ 
                    embeds: [buildEmbed(playerPosition)], 
                    components: [row, row2]
                });
                console.log('✅ Message sent successfully');
                
                // store reference to message so interactions can update it live
                try {
                    if (player) player.nowPlayingMessage = { channelId: channel.id, messageId: msg.id };
                } catch (e) {}
                if (!player) return msg;
                
                // Recommendation generation removed.
            
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
                        
                        // Update only the embed and keep control buttons
                        await msg.edit({ embeds: [buildEmbed(currentPosition, currentTrack)], components: [row, row2] }).catch(() => {});
                    } catch (err) {
                        clearInterval(updateInterval);
                    }
                }, 3000);

                return msg;
            } catch (err) {
                console.error('Error in nowPlaying function:', err.message);
                return channel.send({ content: `❌ Error displaying now playing: ${err.message}` }).catch(() => {});
            }
        } catch (err) {
            console.error('Error in nowPlaying outer:', err.message);
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
                { name: '📌 Position', value: `${position}`, inline: false },
                { name: '⏱️ Duration', value: getDurationString(track) || 'N/A', inline: false }
            ]);

            // Add Play Now button
            const playNowButton = new ButtonBuilder()
                .setCustomId('play_now_track')
                .setLabel('Play Now')
                .setStyle(ButtonStyle.Success)
                .setEmoji('▶️');
            
            const row = new ActionRowBuilder().addComponents(playNowButton);

            return channel.send({ embeds: [embed], components: [row] }).catch(() => {});
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

        const helpButtonsRow = createHelpButtons();
        return channel.send({ embeds: [embed], components: helpButtonsRow ? [helpButtonsRow] : [] });
    },

    // Helper exports
    formatDuration,
    getDurationString,
    createHelpButton,
    createHelpButtons,
    isValidURL,
    updateNowPlaying,
    clearNowPlaying,
    // Button utilities
    createButton: buttonUtils.createButton,
    createButtonRow: buttonUtils.createButtonRow
};


