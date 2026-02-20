const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'bug',
    description: 'Report a bug',
    usage: 'fbug <description>',
    execute: async (message, args, client) => {
        if (args.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🐛 Bug Report')
                .setDescription('Please provide a bug description!\n\n**Usage:** `z bug <description>`')
                .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        const bugReport = args.join(' ');
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('🐛 Bug Report Received')
            .setDescription(`Thank you for reporting! Our team will investigate this.`)
            .addFields([
                {
                    name: '📝 Report',
                    value: bugReport,
                    inline: false
                },
                {
                    name: '👤 Reporter',
                    value: message.author.tag,
                    inline: true
                },
                {
                    name: '🕐 Time',
                    value: `<t:${Math.floor(Date.now() / 1000)}:t>`,
                    inline: true
                }
            ])
            .setFooter({
                text: '⚙️ Reddy Bhai Gaming - Support Server for updates',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }
};
