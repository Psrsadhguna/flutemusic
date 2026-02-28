const messages = require("../utils/messages.js");
const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "history",
    aliases: ["hist"],
    description: "View your play history (last 100 songs)",
    usage: "fhistory",
    cooldownMs: 1500,
    execute: async (message) => {
        const userId = message.author.id;
        const history = Array.isArray(global.userData?.[userId]?.history)
            ? global.userData[userId].history
            : [];

        if (!history.length) {
            return messages.error(message.channel, "You have no play history yet.");
        }

        const itemsPerPage = 10;
        const pageItems = history.slice(0, itemsPerPage);

        const embed = new EmbedBuilder()
            .setColor("#0061ff")
            .setAuthor({
                name: `${message.author.username}'s Play History`,
                iconURL: message.author.displayAvatarURL()
            })
            .setFooter({
                text: `Total: ${history.length} songs | Showing latest ${pageItems.length}`
            })
            .setTimestamp();

        pageItems.forEach((track, index) => {
            embed.addFields({
                name: `${index + 1}. ${track.title || "Unknown"}`,
                value: `${track.author || "Unknown"} | ${getTimeAgo(track.timestamp)}`
            });
        });

        return message.reply({ embeds: [embed] });
    }
};

function getTimeAgo(timestamp) {
    const now = Date.now();
    const ts = Number(timestamp) || now;
    const diff = Math.max(0, now - ts);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 0) return `${seconds}s ago`;
    return "just now";
}
