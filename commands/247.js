const { EmbedBuilder } = require("discord.js");
const messages = require("../utils/messages.js");
const { requireReferralAccess } = require("../utils/referralAccess");
const config = require("../config.js");

function ensurePlayerForVoice(client, message) {
    const guildId = message.guild.id;
    const voiceChannelId = message.member.voice.channel.id;
    const textChannelId = message.channel.id;

    let player = client.riffy.players.get(guildId);

    if (!player) {
        return client.riffy.createConnection({
            guildId,
            voiceChannel: voiceChannelId,
            textChannel: textChannelId,
            deaf: true
        });
    }

    if (player.voiceChannel !== voiceChannelId) {
        try {
            player.setVoiceChannel(voiceChannelId, { deaf: true, mute: false });
        } catch {
            player.connect({
                guildId,
                voiceChannel: voiceChannelId,
                deaf: true,
                mute: false
            });
        }
    } else if (!player.connected) {
        player.connect({
            guildId,
            voiceChannel: voiceChannelId,
            deaf: true,
            mute: false
        });
    }

    if (player.textChannel !== textChannelId && typeof player.setTextChannel === "function") {
        player.setTextChannel(textChannelId);
    }

    return player;
}

module.exports = {
    name: "247",
    aliases: ["24/7", "24-7", "twentyfourseven"],
    description: "Toggle 24/7 mode - bot stays in voice channel (support server only)",
    usage: "f247",
    execute: async (message, args, client) => {
        const supportServerId = String(config.supportServerId || "").trim();
        if (!supportServerId) {
            return messages.error(
                message.channel,
                "Support server ID not configured. Set SUPPORT_SERVER_ID in environment variables."
            );
        }

        const currentGuildId = String(message.guild?.id || "");
        if (currentGuildId !== supportServerId) {
            return messages.error(
                message.channel,
                `24/7 mode support server lo matrame available. Allowed: ${supportServerId}, Current: ${currentGuildId || "unknown"}`
            );
        }

        if (!message.member?.voice?.channel) {
            return messages.error(message.channel, "You must be in a voice channel!");
        }

        if (!await requireReferralAccess(message, { feature: "24/7 Mode" })) {
            return;
        }

        const player = ensurePlayerForVoice(client, message);
        if (!player) {
            return messages.error(message.channel, "Unable to initialize player for 24/7 mode.");
        }

        player.twentyFourSeven = !player.twentyFourSeven;

        if (player.twentyFourSeven && player.leaveTimeout) {
            clearTimeout(player.leaveTimeout);
            player.leaveTimeout = null;
        }

        if (global.stats && global.stats.twentyFourSevenServers) {
            if (player.twentyFourSeven) {
                global.stats.twentyFourSevenServers.add(message.guild.id);
            } else {
                global.stats.twentyFourSevenServers.delete(message.guild.id);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(player.twentyFourSeven ? "#00FF00" : "#FF0000")
            .setTitle(player.twentyFourSeven ? ":white_check_mark: 24/7 Mode Enabled!" : ":x: 24/7 Mode Disabled!")
            .setDescription(player.twentyFourSeven
                ? "The bot will now stay in your voice channel 24/7."
                : "24/7 mode is now off. The bot will auto-disconnect when queue ends.")
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });

        if (!player.twentyFourSeven && (!player.queue || player.queue.length === 0)) {
            try {
                await player.destroy();
            } catch {
                // Ignore destroy errors.
            }
        }
    }
};
