const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'invite',
    description: 'Get bot invite link',
    usage: 'finvite',
    execute: async (message, args, client) => {
        const embed = new EmbedBuilder()
            .setColor('#0061ff')
            .setTitle('🔗 Invite Reddy Bhai Gaming')
            .setDescription('Click the button below to invite our amazing music bot to your server!')
            .addFields([
                {
                    name: '✨ Features',
                    value: '🎵 Music playback • 🎚️ Filters • ✨ Effects • 📊 Queue management',
                    inline: false
                },
                {
                    name: '📋 Permissions',
                    value: '• Send Messages\n• Embed Links\n• Connect to Voice\n• Speak in Voice',
                    inline: false
                }
            ])
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setFooter({
                text: '⚙️ Reddy Bhai Gaming',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Invite Bot')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=36724736`)
                    .setEmoji('🤖'),
                new ButtonBuilder()
                    .setLabel('Support Server')
                    .setStyle(ButtonStyle.Link)
                    .setURL('')
                    .setEmoji('💬')
            );

        return message.channel.send({ embeds: [embed], components: [row] });
    }
};
