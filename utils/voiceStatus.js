const { Routes } = require("discord.js");

async function setVoiceStatus(channel, text) {
    if (!channel || !channel.guild) return;

    try {
        await channel.client.rest.put(
            Routes.channelVoiceStatus(channel.id),
            {
                body: {
                    status: text
                }
            }
        );
    } catch (err) {
        console.error("[VoiceStatus Error]", err.message);
    }
}

module.exports = setVoiceStatus;