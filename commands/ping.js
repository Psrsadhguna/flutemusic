const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'ping',
    description: 'Check bot latency',
    usage: 'fping',
    execute: async (message, args, client) => {
        const msg = await message.channel.send('🏓 Pinging...');
        const latency = msg.createdTimestamp - message.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);

        const embed = new EmbedBuilder()
            .setColor('#0061ff')
            .setTitle('🏓 Ping Pong!')
            .addFields([
                {
                    name: '📡 Bot Latency',
                    value: `${latency}ms`,
                    inline: true
                },
                {
                    name: '🌐 API Latency',
                    value: `${apiLatency}ms`,
                    inline: true
                },
                {
                    name: '⚡ Status',
                    value: apiLatency < 100 ? '✅ Excellent' : apiLatency < 200 ? '🟡 Good' : '🔴 Slow',
                    inline: true
                }
            ])
            .setFooter({
                text: '⚙️ Reddy Bhai Gaming',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        return msg.edit({ content: '', embeds: [embed] });
    }
};
