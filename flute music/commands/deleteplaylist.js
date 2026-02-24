const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'deleteplaylist',
    aliases: ['deletepl', 'pldel', 'rmplaylist'],
    description: 'Delete a saved playlist',
    usage: 'fdeletepl <name>',
    execute: async (message, args, client) => {
        try {
            if (!args || !args[0]) {
                return messages.error(message.channel, '❌ Please provide a playlist name!\nUsage: `fdeletepl <name>`');
            }

            const playlistName = args.join(' ');

            // Get user's playlists
            if (!global.playlists || !global.playlists[message.author.id]) {
                return messages.error(message.channel, '❌ You have no saved playlists!');
            }

            const userPlaylists = global.playlists[message.author.id];
            const playlist = userPlaylists[playlistName];

            if (!playlist) {
                const available = Object.keys(userPlaylists).map(p => `\`${p}\``).join(', ');
                return messages.error(message.channel, `❌ Playlist not found!\n\n**Your playlists:**\n${available || 'None'}`);
            }

            // Delete playlist
            delete userPlaylists[playlistName];

            // Save to file
            const fs = require('fs').promises;
            const path = require('path');
            const playlistPath = path.join(__dirname, '..', 'playlists.json');
            await fs.writeFile(playlistPath, JSON.stringify(global.playlists, null, 2), 'utf8');

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ Playlist Deleted')
                .setDescription(`**Name:** \`${playlistName}\`\n**Songs deleted:** ${playlist.songCount}`)
                .setFooter({ text: 'Playlist Manager' })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
            console.log(`✅ Playlist deleted: "${playlistName}"`);

        } catch (error) {
            console.error('Error deleting playlist:', error);
            messages.error(message.channel, '❌ Error deleting playlist!');
        }
    }
};
