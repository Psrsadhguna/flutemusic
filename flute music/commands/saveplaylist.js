const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'saveplaylist',
    aliases: ['savepl', 'plsave'],
    description: 'Save current queue as a playlist',
    usage: 'fsaveplaylist <name>',
    execute: async (message, args, client) => {
        try {
            if (!args || !args[0]) {
                return messages.error(message.channel, '❌ Please provide a playlist name!\nUsage: `fsaveplaylist <name>`');
            }

            const playlistName = args.join(' ').slice(0, 50); // Max 50 chars
            const player = client.riffy.players.get(message.guild.id);

            // Check if user is in a voice channel
            if (!message.member.voice.channel) {
                return messages.error(message.channel, '❌ You must be in a voice channel!');
            }

            // Check if there's a queue to save
            // Get current track with fallbacks
            let currentTrack = null;
            if (player && player.queue && player.queue.current) {
                currentTrack = player.queue.current;
            } else if (player && player.current) {
                currentTrack = player.current;
            } else if (player && player.nowPlaying) {
                currentTrack = player.nowPlaying;
            }
            
            if (!player || (!currentTrack && (!player.queue || player.queue.length === 0))) {
                return messages.error(message.channel, '❌ Nothing to save! Queue is empty.');
            }

            // Get user's playlists (from global playlists object)
            if (!global.playlists) global.playlists = {};
            if (!global.playlists[message.author.id]) {
                global.playlists[message.author.id] = {};
            }

            // Collect current track + queue
            const tracks = [];
            if (currentTrack) {
                tracks.push({
                    title: currentTrack.info.title,
                    author: currentTrack.info.author,
                    uri: currentTrack.info.uri,
                    duration: currentTrack.info.length,
                    isStream: currentTrack.info.isStream
                });
            }

            // Add queued tracks
            if (player.queue && player.queue.length > 0) {
                player.queue.forEach(track => {
                    tracks.push({
                        title: track.info.title,
                        author: track.info.author,
                        uri: track.info.uri,
                        duration: track.info.length,
                        isStream: track.info.isStream
                    });
                });
            }

            // Save playlist
            global.playlists[message.author.id][playlistName] = {
                name: playlistName,
                tracks: tracks,
                createdAt: new Date().toISOString(),
                songCount: tracks.length,
                totalDuration: tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
            };

            // Save to file
            const fs = require('fs').promises;
            const path = require('path');
            const playlistPath = path.join(__dirname, '..', 'playlists.json');
            await fs.writeFile(playlistPath, JSON.stringify(global.playlists, null, 2), 'utf8');

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Playlist Saved')
                .setDescription(`**Name:** \`${playlistName}\`\n**Songs:** ${tracks.length}`)
                .setFooter({ text: `Use 'floads ${playlistName}' to load this playlist` })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
            console.log(`✅ Playlist saved: "${playlistName}" (${tracks.length} songs)`);

        } catch (error) {
            console.error('Error saving playlist:', error);
            messages.error(message.channel, '❌ Error saving playlist!');
        }
    }
};
