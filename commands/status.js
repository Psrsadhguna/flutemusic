const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder 
} = require('discord.js');
const os = require('os');

const formatDuration = (ms) => {
    if (!ms || ms <= 0 || ms === 'Infinity') return '🔴 LIVE';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
            .toString()
            .padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatUptime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    return `${hours}h ${minutes}m ${seconds}s`;
};

module.exports = {
    name: 'status',
    description: 'Show bot & player status',
    usage: 'fstatus',

    execute: async (message, args, client) => {

        const player = client.riffy.players.get(message.guild.id);

        // MAIN DROPDOWN
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`status_menu_${message.id}`)
            .setPlaceholder('Select what you want to view')
            .addOptions([
                {
                    label: '🤖 Bot Statistics',
                    description: 'View bot information',
                    value: 'bot'
                },
                {
                    label: '🎵 Player Status',
                    description: 'View music player status',
                    value: 'player'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(menu);

        const mainMessage = await message.channel.send({
            content: '📊 **Status Menu**',
            components: [row]
        });

        const collector = mainMessage.createMessageComponentCollector({
            time: 60000
        });

        collector.on('collect', async (interaction) => {

            if (interaction.user.id !== message.author.id) {
                return interaction.reply({
                    content: '❌ This menu is not for you.',
                    ephemeral: true
                });
            }

            // ===========================
            // 🤖 BOT STATS
            // ===========================
            if (interaction.values[0] === 'bot') {

                const totalMembers = client.guilds.cache.reduce(
                    (acc, guild) => acc + guild.memberCount,
                    0
                );

                const usedMemory = Math.round(
                    process.memoryUsage().heapUsed / 1024 / 1024
                );

                const cpuUsage = (
                    process.cpuUsage().user / 1024 / 1024
                ).toFixed(2);

                const botEmbed = new EmbedBuilder()
                    .setColor('#0061FF')
                    .setTitle('🤖 Bot Statistics')
                    .setThumbnail(client.user.displayAvatarURL())
                    .addFields(
                        {
                            name: '📊 Bot Info',
                            value: `**Name:** ${client.user.username}\n**Prefix:** \`f\``
                        },
                        {
                            name: '🌐 Server Stats',
                            value: `**Servers:** ${client.guilds.cache.size}\n**Members:** ${totalMembers}\n**Channels:** ${client.channels.cache.size}`,
                            inline: true
                        },
                        {
                            name: '⚡ Performance',
                            value: `**Ping:** ${Math.round(client.ws.ping)}ms\n**Uptime:** ${formatUptime(client.uptime)}\n**Memory:** ${usedMemory}MB\n**CPU:** ${cpuUsage}%`,
                            inline: true
                        },
                        {
                            name: '🎵 Music Players',
                            value: `**Active:** ${client.riffy.players.size}`,
                            inline: true
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: '⚙️ Reddy Bhai Gaming' });

                return interaction.update({
                    embeds: [botEmbed],
                    components: [row]
                });
            }

            // ===========================
            // 🎵 PLAYER STATUS
            // ===========================
            if (interaction.values[0] === 'player') {

                if (!player) {
                    return interaction.reply({
                        content: '❌ No active music player in this server.',
                        ephemeral: true
                    });
                }

                const track = player.queue.current;
                const duration = track?.info?.duration || 0;
                const position = player.position || 0;

                const progress =
                    duration > 0
                        ? Math.round((position / duration) * 20)
                        : 0;

                const progressBar =
                    '🟩'.repeat(progress) +
                    '⬜'.repeat(20 - progress);

                const playerEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🎵 Player Status')
                    .addFields(
                        {
                            name: '▶️ Status',
                            value: player.playing
                                ? '**Playing** 🎵'
                                : '**Paused** ⏸️',
                            inline: true
                        },
                        {
                            name: '🔊 Volume',
                            value: `${player.volume}%`,
                            inline: true
                        },
                        {
                            name: '🔄 Loop',
                            value:
                                player.loop === 'queue'
                                    ? 'On 🔁'
                                    : 'Off ❌',
                            inline: true
                        },
                        {
                            name: '📋 Queue Size',
                            value: `${player.queue.length} tracks`,
                            inline: true
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: '⚙️ Reddy Bhai Gaming' });

                if (track) {
                    playerEmbed.addFields(
                        {
                            name: '🎵 Now Playing',
                            value: `**[${track.info.title}](${track.info.uri})**`
                        },
                        {
                            name: '👤 Artist',
                            value: track.info.author,
                            inline: true
                        },
                        {
                            name: '⏱ Duration',
                            value: formatDuration(duration),
                            inline: true
                        },
                        {
                            name: '📍 Progress',
                            value: progressBar
                        },
                        {
                            name: '⏰ Position',
                            value: `${formatDuration(position)} / ${formatDuration(duration)}`,
                            inline: true
                        }
                    );

                    if (track.info.thumbnail) {
                        playerEmbed.setThumbnail(track.info.thumbnail);
                    }
                }

                return interaction.update({
                    embeds: [playerEmbed],
                    components: [row]
                });
            }
        });

        collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                menu.setDisabled(true)
            );

            mainMessage.edit({
                components: [disabledRow]
            });
        });
    }
};