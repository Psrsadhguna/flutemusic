const messages = require("../utils/messages.js");
const { EmbedBuilder } = require("discord.js");
const paymentUtils = require("../utils/paymentUtils");

module.exports = {
    name: "myplaylists",
    aliases: ["pllist", "listpl", "mypl"],
    description: "List all your saved playlists",
    usage: "fmyplaylists",
    cooldownMs: 1500,
    execute: async (message) => {
        try {
            const userId = message.author.id;
            const userPlaylists = global.playlists?.[userId] || {};
            const playlistNames = Object.keys(userPlaylists);
            const userIsPremium = paymentUtils.isPremium(userId);
            const maxSlots = userIsPremium ? 20 : 2;

            if (!playlistNames.length) {
                const emptyEmbed = new EmbedBuilder()
                    .setColor("#FF6600")
                    .setTitle("My Playlists")
                    .setDescription("You have no saved playlists yet. Use `fsaveplaylist <name>`. ")
                    .addFields({
                        name: "Save Slots",
                        value: `0/${maxSlots} (${userIsPremium ? "Premium" : "Free"})`
                    })
                    .setTimestamp();
                return message.channel.send({ embeds: [emptyEmbed] });
            }

            const details = playlistNames.map((name) => {
                const playlist = userPlaylists[name];
                const created = playlist.createdAt ? new Date(playlist.createdAt).toLocaleDateString() : "Unknown";
                const duration = formatDuration(playlist.totalDuration || 0);
                return `**${name}**\n- ${playlist.songCount || 0} songs | ${duration} | ${created}`;
            }).join("\n\n");

            const embed = new EmbedBuilder()
                .setColor("#0066FF")
                .setTitle(`My Playlists (${playlistNames.length})`)
                .setDescription(details.slice(0, 3900))
                .addFields(
                    {
                        name: "How to use",
                        value: "`floads <name>` | `fdeletepl <name>` | `fsaveplaylist <name>`"
                    },
                    {
                        name: "Save Slots",
                        value: `${playlistNames.length}/${maxSlots} (${userIsPremium ? "Premium" : "Free"})`
                    }
                )
                .setAuthor({
                    name: message.author.username,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error("Error listing playlists:", error.message);
            return messages.error(message.channel, "Error listing playlists.");
        }
    }
};

function formatDuration(ms) {
    const seconds = Math.floor((Number(ms) || 0) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}
