const { EmbedBuilder } = require('discord.js');

function formatUptime(totalSeconds) {
    const secs = Math.floor(totalSeconds % 60);
    const mins = Math.floor((totalSeconds / 60) % 60);
    const hours = Math.floor((totalSeconds / 3600) % 24);
    const days = Math.floor(totalSeconds / 86400);

    if (days > 0) return `${days}d ${hours}h ${mins}m ${secs}s`;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

module.exports = {
    name: 'ping',
    description: 'Check bot latency and uptime',
    usage: 'fping',
    execute: async (message, args, client) => {
        const latency = Math.max(1, Date.now() - message.createdTimestamp);
        const apiLatency = Math.round(client.ws.ping);
        const uptime = formatUptime(process.uptime());

        const embed = new EmbedBuilder()
            .setColor('#0061ff')
            .setTitle('Ping Pong!')
            .addFields([
                {
                    name: 'Bot Latency',
                    value: `${latency}ms`,
                    inline: true
                },
                {
                    name: 'API Latency',
                    value: `${apiLatency}ms`,
                    inline: true
                },
                {
                    name: 'Uptime',
                    value: uptime,
                    inline: true
                },
                {
                    name: 'Status',
                    value: apiLatency < 100 ? 'Excellent' : apiLatency < 200 ? 'Good' : 'Slow',
                    inline: true
                }
            ])
            .setFooter({
                text: 'flute music team',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }
};
