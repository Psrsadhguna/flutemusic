const { EmbedBuilder } = require('discord.js');
const config = require('../config.js');
const axios = require('axios');

module.exports = {
    name: 'feedback',
    aliases: ['bug'],
    description: 'Send feedback or report a bug',
    usage: 'ffeedback <description>',
    execute: async (message, args, client) => {
        if (args.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('💬 Feedback')
                .setDescription('Please provide your feedback!\n\n**Usage:** `f feedback <description>`')
                .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        const bugReport = args.join(' ');
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('💬 Feedback Received')
            .setDescription(`Thank you for your feedback! Our team will review this.`)
            .addFields([
                {
                    name: '📝 Feedback',
                    value: bugReport,
                    inline: false
                },
                {
                    name: '👤 Sender',
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

        // Send feedback to webhook using axios
        if (config.feedbackWebhookUrl) {
            try {
                const feedbackData = {
                    username: 'Feedback Bot',
                    embeds: [{
                        color: 16711680,
                        title: '💬 New Feedback Received',
                        description: bugReport,
                        fields: [
                            {
                                name: '👤 Sender',
                                value: `${message.author.tag} (ID: ${message.author.id})`,
                                inline: true
                            },
                            {
                                name: '🏢 Server',
                                value: message.guild.name,
                                inline: true
                            },
                            {
                                name: '🆔 Guild ID',
                                value: message.guild.id,
                                inline: true
                            },
                            {
                                name: '🕐 Reported At',
                                value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                                inline: false
                            }
                        ],
                        timestamp: new Date().toISOString()
                    }]
                };

                const response = await axios.post(config.feedbackWebhookUrl, feedbackData);
                console.log('✅ Feedback sent to webhook successfully');
            } catch (error) {
                console.error('❌ Failed to send feedback webhook:', error.message);
                if (error.response) {
                    console.error('Webhook response status:', error.response.status);
                    console.error('Webhook response data:', error.response.data);
                }
            }
        } else {
            console.warn('⚠️ FEEDBACK_WEBHOOK_URL not configured');
        }
    }
};
