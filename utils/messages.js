const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const emojis = require('../emojis.js');
const config = require('../config.js');

// ====================================
// UTILITY FUNCTIONS
// ====================================

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

// Helper: detect language from title/author using heuristics
const detectLanguage = (title = '', author = '') => {
    const text = ((title || '') + ' ' + (author || '')).toLowerCase();
    
    // Detect by Unicode script blocks (most reliable)
    if (/[\u0900-\u097F]/.test(text)) return '🇮🇳 Hindi';      // Devanagari
    if (/[\u0C00-\u0C7F]/.test(text)) return '🇮🇳 Telugu';     // Telugu
    if (/[\u0B80-\u0BFF]/.test(text)) return '🇮🇳 Tamil';      // Tamil
    if (/[\u0C80-\u0CFF]/.test(text)) return '🇮🇳 Kannada';    // Kannada
    if (/[\u0D00-\u0D7F]/.test(text)) return '🇮🇳 Malayalam';  // Malayalam
    if (/[\u0A00-\u0A7F]/.test(text)) return '🇮🇳 Punjabi';    // Punjabi
    if (/[\u0600-\u06FF]/.test(text)) return '🇵🇰 Urdu/Arabic'; // Arabic/Urdu
    
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
        ['portuguese (brazil)', '🇧🇷 Portuguese'],
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
    
    return ''; // No language detected
};

// ====================================
// EMBED BUILDERS
// ====================================

const baseEmbed = (title, description = '') => {
    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTimestamp();
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    embed.setFooter({ text: '© ReddyBhai Gaming' });
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
// MESSAGE EXPORTS
// ====================================

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

        const buildEmbed = (position) => {
            const embed = baseEmbed(`${emojis.playing} Now Playing`)
                .setDescription(`**[${track.info.title}](${track.info.uri})**`);

            if (track.info.thumbnail) {
                embed.setThumbnail(track.info.thumbnail);
            }

            const langTag = detectLanguage(track.info.title, track.info.author);

            const progressBar = createProgressBar(position, track.info.length, track.info.isStream);

            const fields = [
                {
                    name: '🎤 Artist',
                    value: `${track.info.author || 'Unknown'}`,
                    inline: false
                },
                {
                    name: '<a:users:1474075424765247780> ',
                    value: `${track.info.requester?.tag || 'Unknown'}`,
                    inline: false
                },
                {
                    name: '🔗 Source',
                    value: track.info.sourceName || 'Unknown',
                    inline: false
                }
            ];

            if (progressBar) {
                fields.push({
                    name: '<a:chart_increasing:1474387782809161728>  Progress',
                    value: progressBar,
                    inline: false
                });
            }

            fields.push({
                name: '<a:duration:1474072941691146291>',
                value: player
                    ? `${formatDuration(position)} / ${formatDuration(track.info.length)}`
                    : formatDuration(track.info.length),
                inline: false
            });

            // Add next 3 tracks preview
            if (player && player.queue && player.queue.length > 0) {
                const nextTracks = player.queue.slice(0, 3);
                let nextTracksStr = nextTracks.map((t, idx) => {
                    const title = t.info.title.length > 40 ? t.info.title.substring(0, 37) + '...' : t.info.title;
                    const duration = formatDuration(t.info.length) || '∞';
                    return `${idx + 1}️⃣ ${title}\n⏱️ ${duration}`;
                }).join('\n\n');
                
                // Add queue size info
                const queueInfo = player.queue.length > 3 ? `\n\n*+${player.queue.length - 3} more tracks*` : '';
                nextTracksStr += queueInfo;
                
                fields.push({
                    name: '📑 Up Next',
                    value: nextTracksStr || 'No more tracks',
                    inline: false
                });
            }

            if (langTag) {
                fields.push({
                    name: '🌐 Language',
                    value: langTag,
                    inline: false
                });
            }

            embed.addFields(fields);
            return embed;
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
                    .setCustomId('music_stop')
                    .setLabel('Stop')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(emojis.stop)
            );

        return channel.send({ embeds: [buildEmbed(player.position)], components: [row] }).then(msg => {
            // Auto-update progress every 3 seconds
            const updateInterval = setInterval(async () => {
                try {
                    // Stop updating if track is a stream or no player
                    if (!player || track.info.isStream) {
                        clearInterval(updateInterval);
                        return;
                    }

                    await msg.edit({ embeds: [buildEmbed(player.position)] });
                } catch (err) {
                    clearInterval(updateInterval);
                }
            }, 3000);

            // Store interval for cleanup when track ends
            msg._progressInterval = updateInterval;
            return msg;
        });
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
            {
                name: '📊 Tracks',
                value: `${tracks.length} tracks`,
                inline: true
            },
            {
                name: '⏱️ Total Duration',
                value: formatDuration(totalDuration),
                inline: true
            },
            {
                name: '🔴 Streams',
                value: `${streamCount}`,
                inline: true
            }
        ]);

        return channel.send({ embeds: [embed] });
    },

    queueEnded: (channel) => {
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle(`${emojis.info} Queue Ended`)
            .setDescription('🎵 Queue has ended. Leaving voice channel...')
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
            
            // Calculate pagination
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

            const streamCount = queue.filter(t => t.info.isStream).length;
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
            {
                name: '🎵 Status',
                value: statusText,
                inline: true
            },
            {
                name: '🔊 Volume',
                value: `${player.volume}%`,
                inline: true
            },
            {
                name: '🔄 Loop',
                value: loopModeText,
                inline: true
            },
            {
                name: '📊 Queue Size',
                value: `${player.queue.length} tracks`,
                inline: true
            }
        ]);

        if (player.queue.current) {
            const track = player.queue.current;

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

    // Help Command
    help: (channel, helpData, author) => {
        const embed = baseEmbed(`📚 Help & Info`)
            .setDescription(
                `${emojis.info} **Welcome!**\n\n` +
                ` <a:prefix:1474088937440936097>  **Prefix:** \`${helpData.prefix}\`\n` +
                `<a:light_bulb:1474263729477517527>  **For command info:** \`${helpData.prefix}help <command>\`\n` +
                `⚡ **coming soon Slash commands:** Use \`/help\`\n`
            );

        if (author) {
            embed.setAuthor({
                name: author.username,
                iconURL: author.displayAvatarURL({ dynamic: true })
            });



            // Use the invoking user's avatar as the help embed thumbnail
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
            text: '⚙️ Powered By team',
            iconURL: channel.client.user.displayAvatarURL()
        });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Support')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://discord.gg/A5R9HWGkfF')
                    .setEmoji('🔗'),
                new ButtonBuilder()
                    .setLabel('Vote')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/bot/YOUR_BOT_ID/vote')
                    .setEmoji('⭐'),
                new ButtonBuilder()
                    .setLabel('Website')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://example.com')
                    .setEmoji('🌐')
            );

        return channel.send({ embeds: [embed], components: [row] });
    }
}; 