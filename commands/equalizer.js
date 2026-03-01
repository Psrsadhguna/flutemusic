const { EmbedBuilder } = require("discord.js");
const messages = require("../utils/messages.js");
const applyFilters = require("../utils/applyFilters");
const { requirePremium } = require("../utils/requirePremium");

const PRESETS = {
    rock: {
        name: "Rock",
        bands: [
            { band: 0, gain: 0.30 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.20 },
            { band: 3, gain: 0.10 }, { band: 4, gain: 0.05 }, { band: 5, gain: -0.05 },
            { band: 6, gain: -0.10 }, { band: 7, gain: -0.10 }, { band: 8, gain: -0.05 },
            { band: 9, gain: 0.00 }, { band: 10, gain: 0.05 }, { band: 11, gain: 0.15 },
            { band: 12, gain: 0.20 }, { band: 13, gain: 0.25 }, { band: 14, gain: 0.30 }
        ]
    },
    pop: {
        name: "Pop",
        bands: [
            { band: 0, gain: 0.05 }, { band: 1, gain: 0.10 }, { band: 2, gain: 0.15 },
            { band: 3, gain: 0.20 }, { band: 4, gain: 0.15 }, { band: 5, gain: 0.10 },
            { band: 6, gain: 0.00 }, { band: 7, gain: -0.05 }, { band: 8, gain: -0.10 },
            { band: 9, gain: -0.05 }, { band: 10, gain: 0.00 }, { band: 11, gain: 0.10 },
            { band: 12, gain: 0.15 }, { band: 13, gain: 0.20 }, { band: 14, gain: 0.25 }
        ]
    },
    hiphop: {
        name: "Hip-Hop",
        bands: [
            { band: 0, gain: 0.40 }, { band: 1, gain: 0.35 }, { band: 2, gain: 0.20 },
            { band: 3, gain: 0.05 }, { band: 4, gain: -0.10 }, { band: 5, gain: -0.15 },
            { band: 6, gain: -0.10 }, { band: 7, gain: -0.05 }, { band: 8, gain: 0.00 },
            { band: 9, gain: 0.05 }, { band: 10, gain: 0.10 }, { band: 11, gain: 0.05 },
            { band: 12, gain: 0.00 }, { band: 13, gain: 0.10 }, { band: 14, gain: 0.20 }
        ]
    },
    classical: {
        name: "Classical",
        bands: [
            { band: 0, gain: 0.10 }, { band: 1, gain: 0.05 }, { band: 2, gain: 0.00 },
            { band: 3, gain: 0.10 }, { band: 4, gain: 0.20 }, { band: 5, gain: 0.25 },
            { band: 6, gain: 0.20 }, { band: 7, gain: 0.15 }, { band: 8, gain: 0.10 },
            { band: 9, gain: 0.05 }, { band: 10, gain: 0.00 }, { band: 11, gain: -0.05 },
            { band: 12, gain: -0.10 }, { band: 13, gain: -0.05 }, { band: 14, gain: 0.00 }
        ]
    },
    jazz: {
        name: "Jazz",
        bands: [
            { band: 0, gain: 0.15 }, { band: 1, gain: 0.10 }, { band: 2, gain: 0.05 },
            { band: 3, gain: 0.10 }, { band: 4, gain: 0.20 }, { band: 5, gain: 0.20 },
            { band: 6, gain: 0.15 }, { band: 7, gain: 0.10 }, { band: 8, gain: 0.05 },
            { band: 9, gain: 0.00 }, { band: 10, gain: -0.05 }, { band: 11, gain: -0.10 },
            { band: 12, gain: -0.05 }, { band: 13, gain: 0.05 }, { band: 14, gain: 0.10 }
        ]
    },
    metal: {
        name: "Metal",
        bands: [
            { band: 0, gain: 0.35 }, { band: 1, gain: 0.30 }, { band: 2, gain: 0.10 },
            { band: 3, gain: -0.10 }, { band: 4, gain: -0.20 }, { band: 5, gain: -0.20 },
            { band: 6, gain: -0.10 }, { band: 7, gain: 0.05 }, { band: 8, gain: 0.20 },
            { band: 9, gain: 0.30 }, { band: 10, gain: 0.35 }, { band: 11, gain: 0.30 },
            { band: 12, gain: 0.25 }, { band: 13, gain: 0.20 }, { band: 14, gain: 0.15 }
        ]
    },
    bass: {
        name: "Bass Boost",
        bands: [
            { band: 0, gain: 0.22 }, { band: 1, gain: 0.18 }, { band: 2, gain: 0.14 },
            { band: 3, gain: 0.10 }, { band: 4, gain: 0.05 }, { band: 5, gain: 0.02 },
            { band: 6, gain: 0.00 }, { band: 7, gain: -0.02 }, { band: 8, gain: -0.03 },
            { band: 9, gain: -0.03 }, { band: 10, gain: -0.02 }, { band: 11, gain: 0.00 },
            { band: 12, gain: 0.01 }, { band: 13, gain: 0.01 }, { band: 14, gain: 0.01 }
        ]
    },
    treble: {
        name: "Treble Boost",
        bands: [
            { band: 0, gain: 0.00 }, { band: 1, gain: 0.00 }, { band: 2, gain: 0.00 },
            { band: 3, gain: 0.00 }, { band: 4, gain: 0.00 }, { band: 5, gain: 0.00 },
            { band: 6, gain: 0.00 }, { band: 7, gain: 0.00 }, { band: 8, gain: 0.00 },
            { band: 9, gain: 0.05 }, { band: 10, gain: 0.10 }, { band: 11, gain: 0.15 },
            { band: 12, gain: 0.20 }, { band: 13, gain: 0.25 }, { band: 14, gain: 0.30 }
        ]
    },
    flat: {
        name: "Flat",
        bands: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: 0.00 }))
    }
};

module.exports = {
    name: "equalizer",
    aliases: ["eq"],
    description: "Apply equalizer presets (Premium Only)",
    usage: "feq <preset> [on|off] | feq off",
    cooldownMs: 700,
    execute: async (message, args, client) => {
        if (!await requirePremium(message)) return;

        const player = client.riffy.players.get(message.guild.id);
        if (!player) {
            return messages.error(message.channel, "Nothing is playing!");
        }

        const preset = String(args[0] || "").trim().toLowerCase();
        const toggle = String(args[1] || "").trim().toLowerCase();

        if (!preset) {
            const embed = new EmbedBuilder()
                .setColor("#0061ff")
                .setTitle("Equalizer Presets")
                .addFields(
                    {
                        name: "Usage",
                        value: "`feq <preset>` | `feq <preset> on` | `feq <preset> off` | `feq off`",
                        inline: false
                    },
                    {
                        name: "Presets",
                        value: Object.keys(PRESETS).map((key) => `\`${key}\``).join(" | "),
                        inline: false
                    }
                )
                .setTimestamp();
            return message.channel.send({ embeds: [embed] });
        }

        if (toggle && toggle !== "on" && toggle !== "off") {
            return messages.error(message.channel, "Use `on` or `off` only. Example: `feq bass on`.");
        }

        if (preset === "off" || toggle === "off") {
            try {
                player.filters ??= {};
                if (!player.filters.equalizer?.length) {
                    player.filters._equalizerPreset = null;
                    return messages.success(message.channel, "Equalizer already disabled.");
                }
                player.filters.equalizer = [];
                player.filters._equalizerPreset = null;
                await applyFilters(player, message.guild.id);
                return messages.success(message.channel, "Equalizer disabled.");
            } catch (error) {
                console.error(error);
                return messages.error(message.channel, "Failed to disable equalizer.");
            }
        }

        const selectedPreset = PRESETS[preset];
        if (!selectedPreset) {
            return messages.error(
                message.channel,
                `Unknown preset. Use one of: ${Object.keys(PRESETS).join(", ")}`
            );
        }

        try {
            player.filters ??= {};
            const currentPreset = String(player.filters._equalizerPreset || "").trim().toLowerCase();
            if (currentPreset === preset && Array.isArray(player.filters.equalizer) && player.filters.equalizer.length) {
                return messages.success(message.channel, `${selectedPreset.name} is already enabled.`);
            }
            player.filters.equalizer = selectedPreset.bands;
            player.filters._equalizerPreset = preset;
            await applyFilters(player, message.guild.id);
            return messages.success(message.channel, `${selectedPreset.name} equalizer applied.`);
        } catch (error) {
            console.error(error);
            return messages.error(message.channel, "Failed to apply equalizer preset.");
        }
    }
};
