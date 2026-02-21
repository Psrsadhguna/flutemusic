const messages = require('../utils/messages.js');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const os = require('os');

const formatDuration = (ms) => {
    if (!ms || ms <= 0 || ms === 'Infinity') return '🔴 LIVE';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatUptime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
    return `${hours}h ${minutes}m ${seconds}s`;
};

module.exports = {
    name: 'status',
    description: 'Show player and bot status',
    usage: 'fstatus',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        
        // Bot Statistics
        const botEmbed = new EmbedBuilder()
            .setColor('#0061FF')
            .setTitle('🤖 Bot Statistics')
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        // Bot Info
        const totalMembers = await client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
        const cpuUsage = (process.cpuUsage().user / 1024 / 1024).toFixed(2);

        botEmbed.addFields([
            {
                name: '📊 Bot Info',
                value: `**Name:** ${client.user.username}\n**Prefix:** \`f\``,
                inline: false
            },
            {
                name: '🌐 Server Stats',
                value: `**Servers:** ${client.guilds.cache.size}\n**Members:** ${totalMembers.toLocaleString()}\n**Channels:** ${client.channels.cache.size}`,
                inline: true
            },
            {
                name: '⚡ Performance',
                value: `**Ping:** ${Math.round(client.ws.ping)}ms\n**Uptime:** ${formatUptime(client.uptime)}\n**CPU:** ${cpuUsage}%`,
                inline: true
            },
            {
                name: '🎵 Music Players',
                value: `**Active:** ${client.riffy.players.size}`,
                inline: true
            }
        ]);

        // If player exists, add player status
        if (player) {
            const track = player.queue.current;
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('▶️ Player Status')
                .setTimestamp();

            // Player Status
            embed.addFields([
                {
                    name: '▶️ Status',
                    value: player.playing ? '**Playing** 🎵' : '**Paused** ⏸️',
                    inline: true
                },
                {
                    name: '🔊 Volume',
                    value: `**${player.volume}%** ${'█'.repeat(Math.floor(player.volume / 10))}${'░'.repeat(10 - Math.floor(player.volume / 10))}`,
                    inline: true
                },
                {
                    name: '🔄 Loop Mode',
                    value: player.loop === 'queue' ? '**On** 🔁' : '**Off** ❌',
                    inline: true
                }
            ]);

            // Queue Info
            embed.addFields([
                {
                    name: '📋 Queue Size',
                    value: `**${player.queue.length}** tracks`,
                    inline: true
                },
                {
                    name: '🤖 Autoplay',
                    value: player.autoplay ? '**On** ✅' : '**Off** ❌',
                    inline: true
                },
                {
                    name: '🎭 Filters',
                    value: Object.keys(player.filters || {}).length > 0 ? `**${Object.keys(player.filters).length}** active` : '**None**',
                    inline: true
                }
            ]);

            // Current Track Info
            if (track) {
                const duration = track.info.duration || 0;
                const position = player.position || 0;
                const progress = Math.round((position / duration) * 20);
                const progressBar = '🟩'.repeat(progress) + '⬜'.repeat(20 - progress);

                embed.addFields([
                    {
                        name: '🎵 Now Playing',
                        value: `**[${track.info.title}](${track.info.uri})**`,
                        inline: false
                    },
                    {
                        name: '👤 Artist',
                        value: `**${track.info.author}**`,
                        inline: true
                    },
                    {
                        name: '⏱️ Duration',
                        value: formatDuration(duration),
                        inline: true
                    },
                    {
                        name: '📍 Progress',
                        value: progressBar,
                        inline: false
                    },
                    {
                        name: '⏰ Position',
                        value: `${formatDuration(position)} / ${formatDuration(duration)}`,
                        inline: true
                    },
                    {
                        name: '👁️ Requested by',
                        value: `**${track.info.requester?.username || 'Unknown'}**`,
                        inline: true
                    }
                ]);

                if (track.info.thumbnail) {
                    embed.setThumbnail(track.info.thumbnail);
                }
            }

            // Next Track Preview
            if (player.queue.length > 0) {
                const nextTrack = player.queue[0];
                embed.addFields([
                    {
                        name: '⏭️ Next Track',
                        value: `**[${nextTrack.info.title}](${nextTrack.info.uri})** by ${nextTrack.info.author}`,
                        inline: false
                    }
                ]);
            }

            embed.setFooter({ text: '⚙️ Reddy Bhai Gaming' });

            // Send Bot Statistics separately first
            await message.channel.send({ embeds: [botEmbed] });

            // Create two separate dropdowns: one for Player Status, one for Player Controls
            const statusPlaceholder = player.playing ? 'Playing' : 'Paused';

            const playerStatusSelect = new StringSelectMenuBuilder()
                .setCustomId(`player_status_select_${message.guild.id}`)
                .setPlaceholder(`Player Status: ${statusPlaceholder}`)
                .addOptions([
                    {
                        label: `Status: ${player.playing ? 'Playing' : 'Paused'}`,
                        description: 'Toggle play / pause',
                        value: 'toggle_play'
                    },
                    {
                        label: 'Now Playing',
                        description: 'Show current track details',
                        value: 'now_playing'
                    }
                ]);

            const controlsSelect = new StringSelectMenuBuilder()
                .setCustomId(`player_controls_select_${message.guild.id}`)
                .setPlaceholder('Player Controls')
                .addOptions([
                    {
                        label: `Volume: ${player.volume}%`,
                        description: 'Adjust volume',
                        value: 'volume'
                    },
                    {
                        label: `Loop: ${player.loop === 'queue' ? 'On' : 'Off'}`,
                        description: 'Toggle loop mode',
                        value: 'loop'
                    },
                    {
                        label: `Autoplay: ${player.autoplay ? 'On' : 'Off'}`,
                        description: 'Toggle autoplay',
                        value: 'autoplay'
                    },
                    {
                        label: `Queue: ${player.queue.length}`,
                        description: 'Open queue',
                        value: 'queue'
                    }
                ]);

            const row1 = new ActionRowBuilder().addComponents(playerStatusSelect);
            const row2 = new ActionRowBuilder().addComponents(controlsSelect);

            return message.channel.send({ embeds: [embed], components: [row1, row2] });
        } else {
            botEmbed.setFooter({ text: '⚙️ Reddy Bhai Gaming' });
            return message.channel.send({ embeds: [botEmbed] });
        }
    }
};
