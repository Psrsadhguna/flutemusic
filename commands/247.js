const messages = require('../utils/messages.js');
const { requireReferralAccess } = require('../utils/referralAccess');

module.exports = {
    name: '247',
    description: 'Toggle 24/7 mode - bot stays in voice channel (Referral/Premium)',
    usage: 'f247',
    execute: async (message, args, client) => {
        if (!await requireReferralAccess(message, { feature: "24/7 Mode" })) return;
        
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, '❌ Nothing is playing!');

        // Toggle 24/7 mode
        player.twentyFourSeven = !player.twentyFourSeven;

        // If enabling 24/7, clear any pending leave/destroy timeouts (if you use them)
        if (player.twentyFourSeven && player.leaveTimeout) {
            clearTimeout(player.leaveTimeout);
            player.leaveTimeout = null;
        }

        // Track 24/7 servers
        if (global.stats && global.stats.twentyFourSevenServers) {
            if (player.twentyFourSeven) {
                global.stats.twentyFourSevenServers.add(message.guild.id);
            } else {
                global.stats.twentyFourSevenServers.delete(message.guild.id);
            }
        }

        const status = player.twentyFourSeven ? "Enabled" : "Disabled";

        // Custom embed for 24/7 mode toggle
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor(player.twentyFourSeven ? '#00FF00' : '#FF0000')
            .setTitle(player.twentyFourSeven ? ':white_check_mark: 24/7 Mode Enabled!' : ':x: 24/7 Mode Disabled!')
            .setDescription(player.twentyFourSeven
                ? 'The bot will now stay in the voice channel 24/7.'
                : '24/7 mode is now off. The bot will auto-disconnect when the queue ends or is empty.')
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });

        // If disabling 24/7 and queue is empty, disconnect immediately
        if (!player.twentyFourSeven && (!player.queue || player.queue.length === 0)) {
            try {
                await player.destroy();
            } catch (e) {
                // ignore
            }
        }
    }
};
