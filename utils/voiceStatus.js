// utils/voiceStatus.js

// store last status per channel
const lastVoiceStatus = new Map();

/**
 * Set Discord Voice Channel Status
 * @param {VoiceChannel} channel
 * @param {string|null} text
 */
async function setVoiceStatus(channel, text) {
    try {
        if (!channel || !channel.client) return;

        const client = channel.client;

        // normalize value
        const newStatus = text || null;

        // ✅ prevent duplicate updates
        const previousStatus = lastVoiceStatus.get(channel.id);

        if (previousStatus === newStatus) {
            return; // skip same status
        }

        // send REST request
        await client.rest.put(
            `/channels/${channel.id}/voice-status`,
            {
                body: {
                    status: newStatus
                }
            }
        );

        // save last status
        lastVoiceStatus.set(channel.id, newStatus);

        if (newStatus)
            console.log(`🎧 Voice status updated → ${newStatus}`);
        else
            console.log(`🧹 Voice status cleared`);

    } catch (err) {
        console.error("[VoiceStatus Error]", err.message);
    }
}

module.exports = setVoiceStatus;