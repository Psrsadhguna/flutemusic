const { EmbedBuilder } = require("discord.js");
const messages = require("../utils/messages.js");
const { requireReferralAccess } = require("../utils/referralAccess");

module.exports = {
    name: "autoplay",
    aliases: ["ap"],
    description: "Toggle autoplay (Referral/Premium required to enable)",
    usage: "fautoplay [on/off/status/similar/artist/random]",
    cooldownMs: 1500,
    execute: async (message, args, client) => {
        const rawOption = String(args[0] || "toggle").toLowerCase();
        const optionAliases = {
            similer: "similar",
            similair: "similar",
            artish: "artist",
            artiste: "artist",
            rnd: "random"
        };
        const option = optionAliases[rawOption] || rawOption;
        const guildId = message.guild.id;
        const validModes = new Set(["similar", "artist", "random"]);
        const restrictedModes = new Set(["similar", "artist", "random"]);

        if (!global.stats || !(global.stats.autoplayServers instanceof Set)) {
            return messages.error(message.channel, "Autoplay system is not initialized yet.");
        }

        if (!global.stats.autoplayModesByGuild || typeof global.stats.autoplayModesByGuild !== "object") {
            global.stats.autoplayModesByGuild = {};
        }
        if (!global.stats.autoplaySetByGuild || typeof global.stats.autoplaySetByGuild !== "object") {
            global.stats.autoplaySetByGuild = {};
        }

        const currentlyEnabled = global.stats.autoplayServers.has(guildId);
        const currentMode = validModes.has(String(global.stats.autoplayModesByGuild[guildId]).toLowerCase())
            ? String(global.stats.autoplayModesByGuild[guildId]).toLowerCase()
            : "similar";

        let nextEnabled = currentlyEnabled;
        let nextMode = currentMode;

        if (option === "on" || option === "enable") {
            nextEnabled = true;
        } else if (option === "off" || option === "disable") {
            nextEnabled = false;
        } else if (option === "status") {
            nextEnabled = currentlyEnabled;
        } else if (validModes.has(option)) {
            nextEnabled = true;
            nextMode = option;
        } else {
            nextEnabled = !currentlyEnabled;
        }

        if (nextEnabled && restrictedModes.has(nextMode)) {
            const allowed = await requireReferralAccess(message, { feature: `Autoplay ${nextMode} Mode` });
            if (!allowed) return;
        }

        if (option !== "status") {
            if (nextEnabled) {
                global.stats.autoplayServers.add(guildId);
                global.stats.autoplayModesByGuild[guildId] = nextMode;
                global.stats.autoplaySetByGuild[guildId] = message.author.id;
            } else {
                global.stats.autoplayServers.delete(guildId);
                delete global.stats.autoplaySetByGuild[guildId];
                delete global.stats.autoplayModesByGuild[guildId];
            }
        } else if (nextEnabled) {
            if (!global.stats.autoplayModesByGuild[guildId]) {
                global.stats.autoplayModesByGuild[guildId] = nextMode;
            }
            if (!global.stats.autoplaySetByGuild[guildId]) {
                global.stats.autoplaySetByGuild[guildId] = message.author.id;
            }
        }

        const player = client.riffy.players.get(guildId);
        const queueSize = player?.queue?.length || 0;

        const embed = new EmbedBuilder()
            .setColor(nextEnabled ? "#00C853" : "#FF5252")
            .setTitle(nextEnabled ? "Autoplay Enabled" : "Autoplay Disabled")
            .setDescription(
                nextEnabled
                    ? "When queue ends, bot will auto-add a next song using the selected mode."
                    : "When queue ends, bot will stop unless 24/7 mode is enabled."
            )
            .addFields(
                { name: "Current Queue", value: `${queueSize} tracks`, inline: true },
                { name: "Autoplay", value: nextEnabled ? "ON" : "OFF", inline: true },
                { name: "Mode", value: nextMode, inline: true }
            )
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }
};
