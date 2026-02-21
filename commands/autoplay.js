const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'autoplay',
    description: 'Toggle autoplay mode - automatically adds similar songs',
    usage: 'fautoplay',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        // Toggle autoplay mode
        player.autoplay = !player.autoplay;

        const embed = new EmbedBuilder()
            .setColor(player.autoplay ? '#00FF00' : '#FF0000')
            .setTitle(player.autoplay ? '🤖 Autoplay Enabled' : '🤖 Autoplay Disabled')
            .setDescription(player.autoplay 
                ? 'Autoplay is now **ON**. Similar tracks will be added automatically when the queue gets low.'
                : 'Autoplay is now **OFF**. Queue will stop when empty.')
            .setFooter({ text: '⚙️ Reddy Bhai Gaming' })
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
        // Also post a player status and attempt to update the channel topic
        try {
            messages.playerStatus(message.channel, player).catch(() => {});
        } catch (e) { /* ignore */ }

        try {
            const topic = `Music Bot — Autoplay: ${player.autoplay ? 'ON' : 'OFF'} | Loop: ${player.loop === 'queue' ? 'ON' : 'OFF'} | 24/7: ${player.twentyFourSeven ? 'ON' : 'OFF'}`;
            if (message.channel && typeof message.channel.setTopic === 'function') {
                message.channel.setTopic(topic).catch(() => {});
            }
        } catch (e) { /* ignore */ }
    }
};
