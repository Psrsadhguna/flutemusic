const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'uptime',
    description: 'Check bot uptime',
    usage: 'fuptime',
    execute: async (message, args, client) => {
        const uptime = client.uptime;
        
        const days = Math.floor(uptime / 86400000);
        const hours = Math.floor((uptime % 86400000) / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        const seconds = Math.floor((uptime % 60000) / 1000);

        const embed = new EmbedBuilder()
            .setColor('#0061ff')
            .setTitle('⏱️ Bot Uptime')
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .addFields([
                {
                    name: '📊 Total Uptime',
                    value: `${days}d ${hours}h ${minutes}m ${seconds}s`,
                    inline: true
                },
                {
                    name: '⏰ Milliseconds',
                    value: `${uptime}ms`,
                    inline: true
                },
                {
                    name: '🕐 Days',
                    value: `${days}`,
                    inline: true
                },
                {
                    name: '🕑 Hours',
                    value: `${hours}`,
                    inline: true
                },
                {
                    name: '🕒 Minutes',
                    value: `${minutes}`,
                    inline: true
                },
                {
                    name: '🕓 Seconds',
                    value: `${seconds}`,
                    inline: true
                }
            ])
            .setFooter({
                text: '⚙️ Powered By flute music team',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }
};
