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
    name: 'playerstatus',
    description: 'Show player status and bot statistics in a dropdown',
    usage: 'fplayerstatus',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);

        // Build Bot Statistics embed (same as `status` command)
        const botEmbed = new EmbedBuilder()
            .setColor('#0061FF')
            .setTitle('🤖 Bot Statistics')
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        const totalMembers = await client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
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

        botEmbed.setFooter({ text: '⚙️ Reddy Bhai Gaming' });

        // Build Player embed (if player exists)
        let playerEmbed = null;
        if (player) {
            const track = player.queue.current;
            playerEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('▶️ Player Status')
                .setTimestamp();

            playerEmbed.addFields([
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

            playerEmbed.addFields([
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

            if (track) {
                const duration = track.info.duration || 0;
                const position = player.position || 0;
                const progress = duration > 0 ? Math.round((position / duration) * 20) : 0;
                const progressBar = '🟩'.repeat(progress) + '⬜'.repeat(20 - progress);

                playerEmbed.addFields([
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

                if (track.info.thumbnail) playerEmbed.setThumbnail(track.info.thumbnail);
            }

            if (player.queue.length > 0) {
                const nextTrack = player.queue[0];
                playerEmbed.addFields([
                    {
                        name: '⏭️ Next Track',
                        value: `**[${nextTrack.info.title}](${nextTrack.info.uri})** by ${nextTrack.info.author}`,
                        inline: false
                    }
                ]);
            }

            playerEmbed.setFooter({ text: '⚙️ Reddy Bhai Gaming' });
        }

        // Select menu with Bot Statistics as the first/default page
        const viewSelect = new StringSelectMenuBuilder()
            .setCustomId(`player_view_select_${message.guild.id}`)
            .setPlaceholder('Select view')
            .addOptions([
                {
                    label: 'Bot Statistics',
                    description: 'View bot stats (servers, uptime, performance)',
                    value: 'bot_stats'
                },
                {
                    label: 'Player Status',
                    description: 'View player status and controls',
                    value: 'player_status'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(viewSelect);

        // Send initial message showing Bot Statistics first
        const sent = await message.channel.send({ embeds: [botEmbed], components: [row] });

        // If no player exists we can still allow switching to Player Status but show a no-player message
        const filter = (i) => i.user.id === message.author.id;
        const collector = sent.createMessageComponentCollector({ filter, time: 120000 });

        collector.on('collect', async (interaction) => {
            try {
                const choice = interaction.values[0];
                await interaction.deferUpdate();

                if (choice === 'bot_stats') {
                    await sent.edit({ embeds: [botEmbed], components: [row] });
                } else if (choice === 'player_status') {
                    if (!player) {
                        const noEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('No Active Player')
                            .setDescription('There is no active player for this server.')
                            .setFooter({ text: '⚙️ Reddy Bhai Gaming' });
                        await sent.edit({ embeds: [noEmbed], components: [row] });
                    } else {
                        await sent.edit({ embeds: [playerEmbed], components: [row] });
                    }
                }
            } catch (err) {
                console.error('playerstatus collector error:', err);
            }
        });

        collector.on('end', async () => {
            try {
                const disabled = new StringSelectMenuBuilder(viewSelect).setDisabled(true);
                const disabledRow = new ActionRowBuilder().addComponents(disabled);
                await sent.edit({ components: [disabledRow] });
            } catch (e) {
                // ignore
            }
        });
    }
};
