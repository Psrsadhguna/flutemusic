const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'join',
    description: 'Join your voice channel',
    usage: 'fjoin',
    execute: async (message, args, client) => {
        if (!message.member.voice.channel) {
            return messages.error(message.channel, '❌ You must be in a voice channel!');
        }

        try {
            const player = client.riffy.createConnection({
                guildId: message.guild.id,
                voiceChannel: message.member.voice.channel.id,
                textChannel: message.channel.id,
                deaf: true,
            });
            // Ensure sensible defaults when creating the connection
            try { player.autoplay = false; player.setLoop("none"); } catch(e) {/* ignore if not supported */}

            // Restore 24/7 mode from persistent stats
            try { player.twentyFourSeven = Boolean(global.stats && global.stats.twentyFourSevenServers && global.stats.twentyFourSevenServers.has(message.guild.id)); } catch(e) { player.twentyFourSeven = false; }

            // Set flag to prevent immediate queueEnd destruction (lasts 5 seconds)
            player._justJoined = true;
            setTimeout(() => { try { player._justJoined = false; } catch(e) { } }, 5000);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎶 Bot Joined Voice Channel')
                .setDescription(`Joined **${message.member.voice.channel.name}** and ready to play music!`)
                .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            messages.error(message.channel, '❌ Failed to join voice channel!');
        }
    }
};
