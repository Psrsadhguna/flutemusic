const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'equalizer',
    aliases: ['eq'],
    description: 'Apply equalizer presets (rock, pop, hip-hop, classical, jazz, metal)',
    usage: 'fequalizer <preset>',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player)
            return messages.error(message.channel, '❌ Nothing is playing!');

        const preset = args[0]?.toLowerCase();
        const toggle = args[1]?.toLowerCase(); // Check for second argument like "off"

        // Equalizer presets with 15 bands
        const presets = {
            rock: {
                name: '🎸 Rock',
                bands: [
                    { band: 0, gain: 0.3 },
                    { band: 1, gain: 0.25 },
                    { band: 2, gain: 0.2 },
                    { band: 3, gain: 0.1 },
                    { band: 4, gain: 0.05 },
                    { band: 5, gain: -0.05 },
                    { band: 6, gain: -0.1 },
                    { band: 7, gain: -0.1 },
                    { band: 8, gain: -0.05 },
                    { band: 9, gain: 0.0 },
                    { band: 10, gain: 0.05 },
                    { band: 11, gain: 0.15 },
                    { band: 12, gain: 0.2 },
                    { band: 13, gain: 0.25 },
                    { band: 14, gain: 0.3 }
                ]
            },
            pop: {
                name: '🎤 Pop',
                bands: [
                    { band: 0, gain: 0.05 },
                    { band: 1, gain: 0.1 },
                    { band: 2, gain: 0.15 },
                    { band: 3, gain: 0.2 },
                    { band: 4, gain: 0.15 },
                    { band: 5, gain: 0.1 },
                    { band: 6, gain: 0.0 },
                    { band: 7, gain: -0.05 },
                    { band: 8, gain: -0.1 },
                    { band: 9, gain: -0.05 },
                    { band: 10, gain: 0.0 },
                    { band: 11, gain: 0.1 },
                    { band: 12, gain: 0.15 },
                    { band: 13, gain: 0.2 },
                    { band: 14, gain: 0.25 }
                ]
            },
            hiphop: {
                name: '🎤 Hip-Hop',
                bands: [
                    { band: 0, gain: 0.4 },
                    { band: 1, gain: 0.35 },
                    { band: 2, gain: 0.2 },
                    { band: 3, gain: 0.05 },
                    { band: 4, gain: -0.1 },
                    { band: 5, gain: -0.15 },
                    { band: 6, gain: -0.1 },
                    { band: 7, gain: -0.05 },
                    { band: 8, gain: 0.0 },
                    { band: 9, gain: 0.05 },
                    { band: 10, gain: 0.1 },
                    { band: 11, gain: 0.05 },
                    { band: 12, gain: 0.0 },
                    { band: 13, gain: 0.1 },
                    { band: 14, gain: 0.2 }
                ]
            },
            classical: {
                name: '🎻 Classical',
                bands: [
                    { band: 0, gain: 0.1 },
                    { band: 1, gain: 0.05 },
                    { band: 2, gain: 0.0 },
                    { band: 3, gain: 0.1 },
                    { band: 4, gain: 0.2 },
                    { band: 5, gain: 0.25 },
                    { band: 6, gain: 0.2 },
                    { band: 7, gain: 0.15 },
                    { band: 8, gain: 0.1 },
                    { band: 9, gain: 0.05 },
                    { band: 10, gain: 0.0 },
                    { band: 11, gain: -0.05 },
                    { band: 12, gain: -0.1 },
                    { band: 13, gain: -0.05 },
                    { band: 14, gain: 0.0 }
                ]
            },
            jazz: {
                name: '🎷 Jazz',
                bands: [
                    { band: 0, gain: 0.15 },
                    { band: 1, gain: 0.1 },
                    { band: 2, gain: 0.05 },
                    { band: 3, gain: 0.1 },
                    { band: 4, gain: 0.2 },
                    { band: 5, gain: 0.2 },
                    { band: 6, gain: 0.15 },
                    { band: 7, gain: 0.1 },
                    { band: 8, gain: 0.05 },
                    { band: 9, gain: 0.0 },
                    { band: 10, gain: -0.05 },
                    { band: 11, gain: -0.1 },
                    { band: 12, gain: -0.05 },
                    { band: 13, gain: 0.05 },
                    { band: 14, gain: 0.1 }
                ]
            },
            metal: {
                name: '🎸 Metal',
                bands: [
                    { band: 0, gain: 0.35 },
                    { band: 1, gain: 0.3 },
                    { band: 2, gain: 0.1 },
                    { band: 3, gain: -0.1 },
                    { band: 4, gain: -0.2 },
                    { band: 5, gain: -0.2 },
                    { band: 6, gain: -0.1 },
                    { band: 7, gain: 0.05 },
                    { band: 8, gain: 0.2 },
                    { band: 9, gain: 0.3 },
                    { band: 10, gain: 0.35 },
                    { band: 11, gain: 0.3 },
                    { band: 12, gain: 0.25 },
                    { band: 13, gain: 0.2 },
                    { band: 14, gain: 0.15 }
                ]
            },
            bass: {
                name: '🔊 Bass Boost',
                bands: [
                    { band: 0, gain: 0.25 },
                    { band: 1, gain: 0.2 },
                    { band: 2, gain: 0.15 },
                    { band: 3, gain: 0.1 },
                    { band: 4, gain: 0.05 },
                    { band: 5, gain: 0.0 },
                    { band: 6, gain: 0.0 },
                    { band: 7, gain: 0.0 },
                    { band: 8, gain: 0.0 },
                    { band: 9, gain: 0.0 },
                    { band: 10, gain: 0.0 },
                    { band: 11, gain: 0.0 },
                    { band: 12, gain: 0.0 },
                    { band: 13, gain: 0.0 },
                    { band: 14, gain: 0.0 }
                ]
            },
            treble: {
                name: '✨ Treble Boost',
                bands: [
                    { band: 0, gain: 0.0 },
                    { band: 1, gain: 0.0 },
                    { band: 2, gain: 0.0 },
                    { band: 3, gain: 0.0 },
                    { band: 4, gain: 0.0 },
                    { band: 5, gain: 0.0 },
                    { band: 6, gain: 0.0 },
                    { band: 7, gain: 0.0 },
                    { band: 8, gain: 0.0 },
                    { band: 9, gain: 0.05 },
                    { band: 10, gain: 0.1 },
                    { band: 11, gain: 0.15 },
                    { band: 12, gain: 0.2 },
                    { band: 13, gain: 0.25 },
                    { band: 14, gain: 0.3 }
                ]
            },
            flat: {
                name: '📊 Flat',
                bands: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: 0.0 }))
            }
        };

        // Handle off/disable commands: "feq off" or "feq bass off"
        if (preset === 'off' || toggle === 'off') {
            try {
                await player.node.rest.updatePlayer({
                    guildId: message.guild.id,
                    data: {
                        filters: {
                            equalizer: []
                        }
                    }
                });

                const presetName = preset === 'off' ? 'Equalizer' : `${preset} Equalizer`;
                messages.success(
                    message.channel,
                    `✅ ${presetName} **Disabled**!`
                );
            } catch (error) {
                console.error(error);
                messages.error(message.channel, '❌ Failed to disable equalizer!');
            }
            return;
        }

        if (!preset) {
            const embed = new EmbedBuilder()
                .setColor('#0061ff')
                .setTitle('🎚️ Equalizer Presets')
                .setDescription('Available presets:\n')
                .addFields([
                    {
                        name: 'Usage',
                        value: '`feq <preset>` or `feq <preset> off`',
                        inline: false
                    },
                    {
                        name: 'Presets',
                        value: Object.keys(presets).map(p => `\`${p}\``).join(' • '),
                        inline: false
                    },
                    {
                        name: 'Disable',
                        value: '`feq off` - Disable all equalizer\n`feq bass off` - Disable bass preset',
                        inline: false
                    }
                ])
                .setFooter({ text: '⚙️ flute music team' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        if (!presets[preset]) {
            return messages.error(
                message.channel,
                `❌ Unknown preset! Available: ${Object.keys(presets).join(', ')}`
            );
        }

        try {
            await player.node.rest.updatePlayer({
                guildId: message.guild.id,
                data: {
                    filters: {
                        equalizer: presets[preset].bands
                    }
                }
            });

            messages.success(
                message.channel,
                `${presets[preset].name} Equalizer **Applied**! 🎚️`
            );

        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to apply equalizer preset!');
        }
    }
};
