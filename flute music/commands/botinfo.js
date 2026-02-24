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
                    name: '📅 Creation Date',
                    value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:D>`,
                    inline: false
                },
        
                {
                    name: '🌍 Servers',
                    value: `${client.guilds.cache.size}`,
                    inline: false
                },
                {
                    name: '📢 Channels',
                    value: `${client.channels.cache.size}`,
                    inline: false
                },
                {
                    name: '👥 Users',
                    value: `${client.users.cache.size}`,
                    inline: false
                },
                {
                    name: '📡 Ping',
                    value: `${Math.round(client.ws.ping)}ms`,
                    inline: false
                },
                {
                    name: '💾 Memory',
                    value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
                    inline: false
                },
                {
                    name: '🎵 Total Streams',
                    value: `Playing Music In ${client.guilds.cache.filter(g => g.members.me?.voice.channel).size} Server!`,
                    inline: false
                }
            ])
            .setFooter({
                text: '⚙️ Powered By flute music team',
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
