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
                    name: '<a:bot:1474526236150858015> Bot Latency',
                    value: `${latency}ms`,
                    inline: true
                },
                {
                    name: '<a:api_latency:1474526773831008256> API Latency',
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
