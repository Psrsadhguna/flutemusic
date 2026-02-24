const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'history',
    aliases: ['hist'],
    description: 'View your play history (last 100 songs)',
    usage: 'fhistory',
    execute: async (message, args, client) => {
        const userId = message.author.id;

        if (!global.userData[userId] || global.userData[userId].history.length === 0) {
            return messages.error(message.channel, '❌ You have no play history yet!');
        }

        try {
            const history = global.userData[userId].history;
            const itemsPerPage = 10;
            const pages = [];

            for (let i = 0; i < history.length; i += itemsPerPage) {
                const embed = new EmbedBuilder()
                    .setColor('#0061ff')
                    .setAuthor({ name: `${message.author.username}'s Play History`, iconURL: message.author.displayAvatarURL() })
                    .setFooter({ text: `Total: ${history.length} songs | Page ${Math.floor(i / itemsPerPage) + 1} of ${Math.ceil(history.length / itemsPerPage)}` });

                const batch = history.slice(i, i + itemsPerPage);
                batch.forEach((track, idx) => {
                    const timestamp = new Date(track.timestamp);
                    const timeAgo = getTimeAgo(track.timestamp);
                    embed.addFields({
                        name: `${i + idx + 1}. ${track.title}`,
                        value: `👤 ${track.author} • ${timeAgo}`
                    });
                });

                pages.push(embed);
            }

            // Send first page
            message.reply({ embeds: [pages[0]] });
        } catch (error) {
            console.error(error);
            return messages.error(message.channel, 'An error occurred while fetching your history!');
        }
    }
};

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 0) return `${seconds}s ago`;
    return 'just now';
}
