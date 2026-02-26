const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    name: 'recommend',
    aliases: ['rec', 'suggestion'],
    description: 'Get 5 song recommendations',
    usage: 'recommend',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);

        // Song titles to avoid (banned genres/moods)
        const bannedKeywords = ['gym', 'chill'];
        
        // Popular songs for recommendations
        const recommendedSongs = [
            { name: 'Blinding Lights', artist: 'The Weeknd' },
            { name: 'Shape of You', artist: 'Ed Sheeran' },
            { name: 'Levitating', artist: 'Dua Lipa' },
            { name: 'Anti-Hero', artist: 'Taylor Swift' },
            { name: 'As It Was', artist: 'Harry Styles' },
            { name: 'Heat Waves', artist: 'Glass Animals' },
            { name: 'Vampire', artist: 'Olivia Rodrigo' },
            { name: 'Kill Bill', artist: 'SZA' },
            { name: 'Cruel Summer', artist: 'Taylor Swift' },
            { name: 'Sunroof', artist: 'Nicky Youre' },
            { name: 'Where Are You Now', artist: 'Jack Johnson' },
            { name: 'Electric Feel', artist: 'MGMT' },
            { name: 'Pumped Up Kicks', artist: 'Foster the People' },
            { name: 'Mr. Brightside', artist: 'The Killers' },
            { name: 'Take on Me', artist: 'a-ha' },
            { name: 'Don\'t Stop Me Now', artist: 'Queen' },
            { name: 'Walking on Sunshine', artist: 'Katrina & The Waves' },
            { name: 'Good as Hell', artist: 'Lizzo' },
            { name: 'Shut Up and Dance', artist: 'Walk the Moon' },
            { name: 'Tongue Tied', artist: 'Grouplove' },
            { name: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars' },
            { name: 'Lose Yourself', artist: 'Eminem' },
            { name: 'God\'s Plan', artist: 'Drake' },
            { name: 'One Dance', artist: 'Drake ft. Wizkid' },
            { name: 'Hotline Bling', artist: 'Drake' },
            { name: 'HUMBLE.', artist: 'Kendrick Lamar' },
            { name: 'Mask Off', artist: 'Future' },
            { name: 'Stairway to Heaven', artist: 'Led Zeppelin' },
            { name: 'Bohemian Rhapsody', artist: 'Queen' },
            { name: 'Hotel California', artist: 'Eagles' }
        ];

        // Filter out banned keywords
        let filteredSongs = recommendedSongs.filter(song => {
            const fullName = `${song.name} ${song.artist}`.toLowerCase();
            return !bannedKeywords.some(keyword => fullName.includes(keyword));
        });

        // Get random 5 unique songs
        const selectedSongs = [];
        while (selectedSongs.length < 5 && filteredSongs.length > 0) {
            const randomIndex = Math.floor(Math.random() * filteredSongs.length);
            selectedSongs.push(filteredSongs[randomIndex]);
            filteredSongs.splice(randomIndex, 1); // Remove to avoid duplicates
        }

        if (selectedSongs.length === 0) {
            return message.reply('❌ No recommendations available at the moment.');
        }

        // Create dropdown menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('recommend_select')
            .setPlaceholder('Choose a song to play')
            .addOptions(
                selectedSongs.map((song, index) => ({
                    label: `${index + 1}. ${song.name}`,
                    description: `By ${song.artist}`,
                    value: `${song.name}|${song.artist}`
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#0061ff')
            .setTitle('🎵 Song Recommendations')
            .setDescription('Choose one of the 5 suggestions below to play')
            .addFields(
                selectedSongs.map((song, index) => ({
                    name: `#${index + 1}`,
                    value: `**${song.name}** by ${song.artist}`,
                    inline: false
                }))
            )
            .setFooter({
                text: '⚙️ flute music team',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        const msg = await message.reply({ embeds: [embed], components: [row] });

        // Handle selection
        const filter = (interaction) => interaction.user.id === message.author.id;
        const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (interaction) => {
            const [songName, artistName] = interaction.values[0].split('|');
            
            const infoEmbed = new EmbedBuilder()
                .setColor('#0061ff')
                .setTitle('🎵 Song Details')
                .addFields([
                    {
                        name: 'Song Name',
                        value: songName,
                        inline: false
                    },
                    {
                        name: 'Artist',
                        value: artistName,
                        inline: false
                    },
                    {
                        name: 'How to Play',
                        value: `Use \`fplay ${songName}\` or \`fplay ${songName} ${artistName}\``,
                        inline: false
                    }
                ])
                .setFooter({ text: '⚙️ flute music team' });

            interaction.reply({ embeds: [infoEmbed], ephemeral: false });
            collector.stop();
        });

        collector.on('end', () => {
            // Edit message to remove buttons after timeout
            msg.edit({ components: [] }).catch(() => {});
        });
    }
};
