const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'topac',
    aliases: ['topartists', 'topcreators'],
    description: 'View top artists and most played tracks globally',
    usage: 'ftopac [artists/tracks]',
    execute: async (message, args, client) => {
        const type = args[0]?.toLowerCase() || 'artists';

        try {
            if (type === 'artists' || type === 'creators') {
                // Get top artists from all servers
                const topArtists = Object.entries(global.stats.topArtists)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15);

                if (topArtists.length === 0) {
                    return messages.error(message.channel, '❌ No artists tracked yet!');
                }

                const embed = new EmbedBuilder()
                    .setColor('#0061ff')
                    .setTitle('🎤 Top Artists/Creators')
                    .setDescription(`Most played artists across ${client.guilds.cache.size} servers`)
                    .setFooter({ text: `Updated at ${new Date().toLocaleTimeString()}` });

                topArtists.forEach((artist, idx) => {
                    const medal = getMedal(idx);
                    embed.addFields({
                        name: `${medal} ${idx + 1}. ${artist[0]}`,
                        value: `🎵 ${artist[1]} plays`,
                        inline: false
                    });
                });

                return message.reply({ embeds: [embed] });

            } else if (type === 'tracks' || type === 'songs') {
                // Get most recently played tracks
                const recentlyPlayed = global.stats.recentlyPlayed || [];

                if (recentlyPlayed.length === 0) {
                    return messages.error(message.channel, '❌ No tracks have been played yet!');
                }

                // Count occurrences
                const trackCounts = {};
                recentlyPlayed.forEach(track => {
                    const key = `${track.title}|${track.author}`;
                    trackCounts[key] = (trackCounts[key] || 0) + 1;
                });

                const topTracks = Object.entries(trackCounts)
                    .map(([key, count]) => {
                        const [title, author] = key.split('|');
                        return { title, author, count };
                    })
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 15);

                if (topTracks.length === 0) {
                    return messages.error(message.channel, '❌ No tracks tracked yet!');
                }

                const embed = new EmbedBuilder()
                    .setColor('#0061ff')
                    .setTitle('🔥 Most Played Tracks')
                    .setDescription(`Most played songs in the last session`)
                    .setFooter({ text: `Updated at ${new Date().toLocaleTimeString()}` });

                topTracks.forEach((track, idx) => {
                    const medal = getMedal(idx);
                    embed.addFields({
                        name: `${medal} ${idx + 1}. ${track.title}`,
                        value: `👤 ${track.author} • ${track.count} plays`,
                        inline: false
                    });
                });

                return message.reply({ embeds: [embed] });

            } else {
                return messages.error(message.channel, '❌ Use `ftopac artists` or `ftopac tracks`!');
            }
        } catch (error) {
            console.error(error);
            return messages.error(message.channel, 'An error occurred while fetching top artists/tracks!');
        }
    }
};

function getMedal(index) {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return '🎵';
}
