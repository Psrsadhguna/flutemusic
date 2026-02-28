const { EmbedBuilder } = require("discord.js");
const messages = require("../utils/messages.js");

module.exports = {
    name: "autoplay",
    aliases: ["ap"],
    description: "Toggle auto-recommendation playback when queue ends",
    usage: "fautoplay [on/off/status]",
    cooldownMs: 1500,
    execute: async (message, args, client) => {
        const option = String(args[0] || "toggle").toLowerCase();
        const guildId = message.guild.id;

        if (!global.stats || !(global.stats.autoplayServers instanceof Set)) {
            return messages.error(message.channel, "Autoplay system is not initialized yet.");
        }

        const currentlyEnabled = global.stats.autoplayServers.has(guildId);
        let nextEnabled = currentlyEnabled;

        if (option === "on" || option === "enable") {
            nextEnabled = true;
        } else if (option === "off" || option === "disable") {
            nextEnabled = false;
        } else if (option === "status") {
            nextEnabled = currentlyEnabled;
        } else {
            nextEnabled = !currentlyEnabled;
        }

        if (option !== "status") {
            if (nextEnabled) global.stats.autoplayServers.add(guildId);
            else global.stats.autoplayServers.delete(guildId);
        }

        const player = client.riffy.players.get(guildId);
        const queueSize = player?.queue?.length || 0;

        const embed = new EmbedBuilder()
            .setColor(nextEnabled ? "#00C853" : "#FF5252")
            .setTitle(nextEnabled ? "Autoplay Enabled" : "Autoplay Disabled")
            .setDescription(
                nextEnabled
                    ? "When queue ends, bot will try to auto-add a recommended next song."
                    : "When queue ends, bot will stop unless 24/7 mode is enabled."
            )
            .addFields(
                { name: "Current Queue", value: `${queueSize} tracks`, inline: true },
                { name: "Mode", value: nextEnabled ? "Auto Recommend: ON" : "Auto Recommend: OFF", inline: true }
            )
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }
};
