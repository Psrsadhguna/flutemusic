const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'myplaylists',
    aliases: ['pllist', 'listpl', 'mypl'],
    description: 'List all your saved playlists',
    usage: 'fmyplaylists',
    execute: async (message, args, client) => {
        try {
            // Get user's playlists
            if (!global.playlists || !global.playlists[message.author.id]) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6600')
                    .setTitle('📂 My Playlists')
                    .setDescription('❌ You have no saved playlists yet!\n\nUse `fsaveplaylist <name>` to save one.')
                    .setFooter({ text: 'Playlist Manager' })
                    .setTimestamp();
                return await message.channel.send({ embeds: [embed] });
            }

            const userPlaylists = global.playlists[message.author.id];
            const playlistNames = Object.keys(userPlaylists);

            if (playlistNames.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#FF6600')
                    .setTitle('📂 My Playlists')
                    .setDescription('❌ You have no saved playlists yet!\n\nUse `fsaveplaylist <name>` to save one.')
                    .setFooter({ text: 'Playlist Manager' })
                    .setTimestamp();
                return await message.channel.send({ embeds: [embed] });
            }

            // Build playlist list
            const playlistDetails = playlistNames.map(name => {
                const pl = userPlaylists[name];
                const created = new Date(pl.createdAt).toLocaleDateString();
                const duration = formatDuration(pl.totalDuration);
                return `**${name}**\n└ ${pl.songCount} songs • ${duration} • Created: ${created}`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor('#0066FF')
                .setTitle(`📂 My Playlists (${playlistNames.length})`)
                .setDescription(playlistDetails)
                .addFields(
                    {
                        name: '📋 How to use:',
                        value: '`floads <name>` - Load a playlist\n`fdeletepl <name>` - Delete a playlist\n`fsaveplaylist <name>` - Save new playlist'
                    }
                )
                .setAuthor({
                    name: message.author.username,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                })
                .setFooter({ text: 'Playlist Manager' })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
            console.log(`✅ Listed ${playlistNames.length} playlists for ${message.author.tag}`);

        } catch (error) {
            console.error('Error listing playlists:', error);
            messages.error(message.channel, '❌ Error listing playlists!');
        }
    }
};

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}
