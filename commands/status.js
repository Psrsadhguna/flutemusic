const { EmbedBuilder } = require("discord.js");

function formatUptime(ms) {
    const totalSec = Math.floor((Number(ms) || 0) / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function getNodeList(client) {
    const nodes = client.riffy?.nodes;
    if (!nodes) return [];
    if (Array.isArray(nodes)) return nodes;
    if (typeof nodes.values === "function") return Array.from(nodes.values());
    return [];
}

async function getServerCount(client) {
    const cacheCount = client.guilds.cache.filter((guild) => guild.available !== false).size;
    try {
        const liveGuilds = await client.guilds.fetch();
        return liveGuilds.size;
    } catch {
        return cacheCount;
    }
}

module.exports = {
    name: "status",
    aliases: ["health", "botstatus"],
    description: "Show bot health, uptime, and music node status",
    usage: "fstatus",
    cooldownMs: 1500,
    execute: async (message, args, client) => {
        const nodeList = getNodeList(client);
        const connectedNodes = nodeList.filter((n) => n.connected).length;
        const memoryMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
        const stats = global.stats || {};
        const serverCount = await getServerCount(client);

        const embed = new EmbedBuilder()
            .setColor("#00B8D4")
            .setTitle("Flute Music Bot Status")
            .addFields(
                { name: "Uptime", value: formatUptime(client.uptime), inline: true },
                { name: "Ping", value: `${Math.round(client.ws.ping)}ms`, inline: true },
                { name: "Memory", value: `${memoryMb} MB`, inline: true },
                { name: "Servers", value: `${serverCount}`, inline: true },
                { name: "Commands Used", value: `${stats.totalCommandsExecuted || 0}`, inline: true },
                { name: "Errors Logged", value: `${stats.errorCount || 0}`, inline: true },
                { name: "Music Nodes", value: `${connectedNodes}/${nodeList.length} connected`, inline: false }
            )
            .setTimestamp();

        if (nodeList.length > 0) {
            const nodeDetails = nodeList
                .slice(0, 4)
                .map((node) => `- ${node.name || "Node"}: ${node.connected ? "ONLINE" : "OFFLINE"}`)
                .join("\n");
            embed.addFields({
                name: "Node Details",
                value: nodeDetails || "No node details available",
                inline: false
            });
        }

        return message.channel.send({ embeds: [embed] });
    }
};
