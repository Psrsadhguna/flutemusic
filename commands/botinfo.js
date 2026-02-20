const { EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: 'botinfo',
    description: 'Display bot information',
    usage: 'fbotinfo',
    execute: async (message, args, client) => {
        const embed = new EmbedBuilder()
            .setColor('#0061ff')
            .setTitle('🤖 Bot Information')
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .addFields([
                {
                    name: '👑 Bot Name',
                    value: 'flute music',
                    inline: true
                },




                {
                    name: '📅 Created',
                    value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:D>`,
                    inline: true
                },




                {
                    name: '⚡ Servers',
                    value: `${client.guilds.cache.size}`,
                    inline: true
                },



            
                {
                    name: '👥 Users',
                    value: `${client.users.cache.size}`,
                    inline: true
                },



                {
                    name: '📚 Commands',
                    value: '30+',
                    inline: true
                },



                {
                    name: '� Prefix',
                    value: '`f`',
                    inline: true
                }


                
            ])
            .setFooter({
                text: '⚙️ Powered By Reddy Bhai Gaming',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        // attempt to update website status file with current counts
        (async () => {
            try {
                const statusPath = path.join(__dirname, '..', 'website', 'status.json');
                const data = {
                    servers: client.guilds.cache.size,
                    members: client.users.cache.size,
                    updated: new Date().toISOString()
                };
                await fs.writeFile(statusPath, JSON.stringify(data, null, 2), 'utf8');
            } catch (err) {
                console.error('Could not write website/status.json', err);
            }
        })();

        return message.channel.send({ embeds: [embed] });
    }
};
