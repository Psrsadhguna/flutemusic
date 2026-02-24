const messages = require('../utils/messages.js');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'loop',
    description: 'Toggle queue loop mode',
    usage: 'floop',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "❌ Nothing is playing!");

        // Get the current loop mode and toggle between NONE and QUEUE
        const currentMode = player.loop;
        const newMode = currentMode === "none" ? "queue" : "none";
        
        player.setLoop(newMode);
        
        const embed = new EmbedBuilder()
            .setColor(newMode === "queue" ? '#00FF00' : '#FF0000')
            .setTitle(newMode === "queue" ? '🔁 Loop Enabled' : '🔂 Loop Disabled')
            .setDescription(newMode === "queue" ? 'Queue loop mode is now **ON**' : 'Queue loop mode is now **OFF**')
            .setFooter({ text: '⚙️ flute music team' })
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
