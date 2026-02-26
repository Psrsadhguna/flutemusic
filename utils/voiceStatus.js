// utils/voiceStatus.js

async function setVoiceStatus(channel, text) {
    if (!channel || !channel.client) return;

    try {
        await channel.client.rest.put(
            `/channels/${channel.id}/voice-status`,
            {
                body: {
                    status: text
                }
            }
        );

        console.log(`✅ Voice status set: ${text}`);
    } catch (err) {
        console.error("[VoiceStatus Error]", err.message);
    }
}

module.exports = setVoiceStatus;