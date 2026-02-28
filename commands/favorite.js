const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'favorite',
    aliases: ['fav', 'favorites', 'favourite'],
    description: 'Add or remove songs from your favorites, view your favorites, and play them',
    usage: 'ffavorite [add/remove/list/play <number>]',
    execute: async (message, args, client) => {
        const action = args[0]?.toLowerCase() || 'list';
        const userId = message.author.id;

        if (!global.userData[userId]) {
            global.userData[userId] = { favorites: [], history: [] };
        }

        try {
            if (action === 'add') {
                // Add currently playing song to favorites
                const player = client.riffy.players.get(message.guild.id);
                if (!player || !player.current) {
                    return messages.error(message.channel, '❌ No song is currently playing!');
                }

                const track = player.current;
                const isFavorited = global.userData[userId].favorites.some(
                    f => f.uri === track.info.uri
                );

                if (isFavorited) {
                    return messages.error(message.channel, '❌ This song is already in your favorites!');
                }

                global.userData[userId].favorites.push({
                    title: track.info.title,
                    author: track.info.author,
                    uri: track.info.uri,
                    timestamp: Date.now()
                });

                const embed = new EmbedBuilder()
                    .setColor('#0061ff')
                    .setTitle('❤️ Added to Favorites')
                    .setDescription(`**${track.info.title}** by **${track.info.author}**`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });

            } else if (action === 'remove') {
                // Remove song from favorites
                const trackQuery = args.slice(1).join(' ');
                if (!trackQuery) {
                    return messages.error(message.channel, '❌ Please specify a song to remove!');
                }

                const index = global.userData[userId].favorites.findIndex(
                    f => f.title.toLowerCase().includes(trackQuery.toLowerCase()) ||
                        f.author.toLowerCase().includes(trackQuery.toLowerCase())
                );

                if (index === -1) {
                    return messages.error(message.channel, '❌ Song not found in your favorites!');
                }

                const removed = global.userData[userId].favorites.splice(index, 1)[0];
                const embed = new EmbedBuilder()
                    .setColor('#0061ff')
                    .setTitle('💔 Removed from Favorites')
                    .setDescription(`**${removed.title}** by **${removed.author}**`)
                    .setTimestamp();

                return message.reply({ embeds: [embed] });

            } else if (action === 'list' || action === 'view') {
                // List user's favorites
                const favorites = global.userData[userId].favorites;

                if (favorites.length === 0) {
                    return messages.error(message.channel, '❌ You have no favorite songs yet! Use `ffav add` while a song is playing.');
                }

                const pages = [];
                for (let i = 0; i < favorites.length; i += 10) {
                    const embed = new EmbedBuilder()
                        .setColor('#0061ff')
                        .setTitle(`❤️ Your Favorite Songs (${favorites.length})`)
                        .setFooter({ text: `Page ${Math.floor(i / 10) + 1} of ${Math.ceil(favorites.length / 10)}` });

                    const batch = favorites.slice(i, i + 10);
                    batch.forEach((fav, idx) => {
                        embed.addFields({
                            name: `${i + idx + 1}. ${fav.title}`,
                            value: `by ${fav.author}`
                        });
                    });

                    pages.push(embed);
                }

                return message.reply({ embeds: [pages[0]] });

            } else if (action === 'play') {
                // Play a favorite song by number
                const trackNumber = parseInt(args[1]);
                const favorites = global.userData[userId].favorites;

                if (isNaN(trackNumber) || trackNumber < 1 || trackNumber > favorites.length) {
                    return messages.error(message.channel, `❌ Please specify a valid song number (1-${favorites.length})!`);
                }

                const selectedFav = favorites[trackNumber - 1];

                // Check if user is in a voice channel
                if (!message.member.voice.channel) {
                    return messages.error(message.channel, '❌ You must be in a voice channel!');
                }

                // Create a connection (join VC) and get the player
                const player = client.riffy.createConnection({
                    guildId: message.guild.id,
                    voiceChannel: message.member.voice.channel.id,
                    textChannel: message.channel.id,
                    deaf: true,
                });

                // Disable autoplay to prevent automatic song continuation
                try {
                    player.autoplay = false;
                } catch (e) {}
                try {
                    player.setLoop("none");
                } catch (e) {}

                // Restore 24/7 mode from persistent stats
                try { player.twentyFourSeven = Boolean(global.stats && global.stats.twentyFourSevenServers && global.stats.twentyFourSevenServers.has(message.guild.id)); } catch(e) { player.twentyFourSeven = false; }

                if (selectedFav) {
                    const track = await client.riffy.resolve({
                        query: selectedFav.uri,
                        requester: message.author
                    });

                    if (!track || !track.tracks || track.tracks.length === 0) {
                        return messages.error(message.channel, '❌ Could not load the favorite song!');
                    }

                    const resolvedTrack = track.tracks[0];
                    player.queue.add(resolvedTrack);
                    
                    // Start playing if nothing is playing
                    if (!player.playing && !player.paused) {
                        await player.play();
                    }
                    
                    const isPlaying = player.playing;
                    const embed = new EmbedBuilder()
                        .setColor('#0061ff')
                        .setTitle('<a:Queue:1474140240968024065>  Added to Queue')
                        .setDescription(`**${selectedFav.title}** by **${selectedFav.author}**`)
                        .addFields({
                            name: 'Status',
                            value: isPlaying ? '🎵 Now Playing' : '⏸️ Not Playing',
                            inline: false
                        })
                        .setTimestamp();

                    return message.reply({ embeds: [embed] });
                }

            } else {
                return messages.error(message.channel, '❌ Use `ffav add`, `ffav remove`, `ffav list`, or `ffav play [number]`!');
            }
        } catch (error) {
            console.error(error);
            return messages.error(message.channel, 'An error occurred while managing favorites!');
        }
    }
};
