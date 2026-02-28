const applyFilters = require('../utils/applyFilters');
const messages = require('../utils/messages');
const { requirePremium } = require('../utils/requirePremium');

module.exports = {
    name: 'slowedreverb',
    aliases: ['sr', 'slowreverb', 'slowed+reverb'],
    description: 'Apply slowed + reverb style effect (Premium Only)',
    usage: 'fslowedreverb',
    execute: async (message, args, client) => {
        if (!await requirePremium(message)) return;

        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, 'Nothing is playing.');

        try {
            player.filters ??= {};
            const enabled = !player.filters._slowedreverb;
            player.filters._slowedreverb = enabled;

            if (enabled) {
                // "Reverb" is approximated via EQ + mild modulation because Lavalink has no native reverb filter.
                player.filters.timescale = { speed: 0.85, pitch: 0.94, rate: 1 };
                player.filters.equalizer = [
                    { band: 0, gain: 0.16 },
                    { band: 1, gain: 0.12 },
                    { band: 2, gain: 0.06 },
                    { band: 3, gain: -0.02 },
                    { band: 4, gain: -0.08 },
                    { band: 5, gain: -0.12 }
                ];
                player.filters.tremolo = { frequency: 3.2, depth: 0.11 };
            } else {
                player.filters.timescale = {};
                player.filters.equalizer = [];
                player.filters.tremolo = {};
            }

            await applyFilters(player, message.guild.id);
            return messages.success(
                message.channel,
                `Slowed + Reverb ${enabled ? 'enabled' : 'disabled'}.`
            );
        } catch (error) {
            console.error('slowedreverb error:', error);
            return messages.error(message.channel, 'Failed to apply Slowed + Reverb effect.');
        }
    }
};

