const { EmbedBuilder } = require("discord.js");
const messages = require("../utils/messages.js");

module.exports = {
    name: "autoplay",
    aliases: ["ap"],
    description: "Toggle autoplay and set mode (similar/artist/random)",
    usage: "fautoplay [on/off/status/similar/artist/random]",
    cooldownMs: 1500,
    execute: async (message, args, client) => {
        const option = String(args[0] || "toggle").toLowerCase();
        const guildId = message.guild.id;
        const validModes = new Set(["similar", "artist", "random"]);

        if (!global.stats || !(global.stats.autoplayServers instanceof Set)) {
            return messages.error(message.channel, "Autoplay system is not initialized yet.");
        }

        if (!global.stats.autoplayModesByGuild || typeof global.stats.autoplayModesByGuild !== "object") {
            global.stats.autoplayModesByGuild = {};
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

        if (option !== "status") {
            if (nextEnabled) {
                global.stats.autoplayServers.add(guildId);
                global.stats.autoplayModesByGuild[guildId] = nextMode;
            } else {
                global.stats.autoplayServers.delete(guildId);
            }
        } else if (nextEnabled && !global.stats.autoplayModesByGuild[guildId]) {
            global.stats.autoplayModesByGuild[guildId] = nextMode;
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
