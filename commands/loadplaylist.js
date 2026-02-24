const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'loadplaylist',
    aliases: ['loadpl', 'plload', 'loadt'],
    description: 'Load a saved playlist',
    usage: 'floads <name>',
    execute: async (message, args, client) => {
        try {
            if (!args || !args[0]) {
                return messages.error(message.channel, '❌ Please provide a playlist name!\nUsage: `floads <name>`');
            }

            const playlistName = args.join(' ');

            // Check if user is in a voice channel
            if (!message.member.voice.channel) {
                return messages.error(message.channel, '❌ You must be in a voice channel!');
            }

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

            if (!playlist.tracks || playlist.tracks.length === 0) {
                return messages.error(message.channel, '❌ This playlist is empty!');
            }

            // Get or create player
            let player = client.riffy.players.get(message.guild.id);
            if (!player) {
                player = client.riffy.createConnection({
                    guildId: message.guild.id,
                    voiceChannel: message.member.voice.channel.id,
                    textChannel: message.channel.id,
                    deaf: true
                });
            }

            // Disable autoplay to prevent automatic song continuation
            try {
                player.autoplay = false;
            } catch (e) {}
            try {
                player.setLoop("none");
            } catch (e) {}

            // Clear current queue
            if (player.queue.current) {
                player.queue.current = null;
            }
            player.queue.clear();

            let addedCount = 0;
            let failedCount = 0;

            // Load all tracks from playlist
            for (const trackData of playlist.tracks) {
                try {
                    const resolve = await client.riffy.resolve({
                        query: trackData.uri,
                        requester: message.author
                    });

                    if (resolve && resolve.tracks && resolve.tracks.length > 0) {
                        const track = resolve.tracks[0];
                        track.info.requester = message.author;
                        player.queue.add(track);
                        addedCount++;
                    } else {
                        failedCount++;
                    }
                } catch (err) {
                    console.warn(`Failed to load track: ${trackData.title}`, err);
                    failedCount++;
                }
            }

            // Start playing
            if (!player.playing && !player.paused && player.queue.current) {
                player.play();
            } else if (!player.playing && !player.paused && player.queue.length > 0) {
                player.play();
            }

            const embed = new EmbedBuilder()
                .setColor('#0066FF')
                .setTitle(`📂 Playlist Loaded: ${playlistName}`)
                .setDescription(
                    `✅ Added: ${addedCount} songs\n` +
                    (failedCount > 0 ? `⚠️ Failed: ${failedCount} songs\n` : '') +
                    `⏱️ Duration: ${formatDuration(playlist.totalDuration)}`
                )
                .setFooter({ text: `Queue now has ${player.queue.length} songs` })
                .setTimestamp();

            await message.channel.send({ embeds: [embed] });
            console.log(`✅ Loaded playlist: "${playlistName}" (${addedCount} songs)`);

        } catch (error) {
            console.error('Error loading playlist:', error);
            messages.error(message.channel, '❌ Error loading playlist!');
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
