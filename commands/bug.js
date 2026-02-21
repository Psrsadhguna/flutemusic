const { EmbedBuilder, WebhookClient } = require('discord.js');
const config = require('../config.js');

module.exports = {
    name: 'feedback',
    aliases: ['bug'],
    description: 'Send feedback or report a bug',
    usage: 'ffeedback <description>',
    execute: async (message, args, client) => {
        if (args.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('� Feedback')
                .setDescription('Please provide your feedback!\n\n**Usage:** `f feedback <description>`')
                .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        const bugReport = args.join(' ');
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('� Feedback Received')
            .setDescription(`Thank you for your feedback! Our team will review this.`)
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

        // Send acknowledgment to user
        await message.channel.send({ embeds: [embed] });

        // Send bug report to feedback webhook
        if (config.feedbackWebhookUrl) {
            try {
                const webhook = new WebhookClient({ url: config.feedbackWebhookUrl });
                const feedbackEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('� New Feedback')
                    .setDescription(bugReport)
                    .addFields([
                        {
                            name: '👤 Reporter',
                            value: `${message.author.tag} (${message.author.id})`,
                            inline: true
                        },
                        {
                            name: '🏢 Server',
                            value: message.guild.name,
                            inline: true
                        },
                        {
                            name: '🕐 Reported At',
                            value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                            inline: false
                        }
                    ])
                    .setTimestamp();

                webhook.send({ embeds: [feedbackEmbed] }).catch(err => console.error('Feedback webhook error:', err));
            } catch (error) {
                console.error('Failed to send feedback webhook:', error);
            }
        }
    }
};
