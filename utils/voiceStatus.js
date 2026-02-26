// utils/voiceStatus.js

async function setVoiceStatus(channel, text) {
    if (!channel || !channel.client) return;

    try {
        // Check if bot has SetVoiceChannelStatus permission
        const guild = channel.guild;
        if (!guild) return;

        const botMember = await guild.members.fetch(channel.client.user.id).catch(() => null);
        if (!botMember) {
            console.warn(`[VoiceStatus] Bot not found in guild ${guild.id}`);
            return;
        }

        if (!botMember.permissions.has('SetVoiceChannelStatus')) {
            console.warn(`[VoiceStatus] Bot missing SET_VOICE_CHANNEL_STATUS permission in ${guild.name}`);
            return;
        }

        // Convert null to empty string to clear the status
        const statusText = text === null || text === undefined ? "" : text;

        await channel.client.rest.put(
            `/channels/${channel.id}/voice-status`,
            {
                body: {
                    status: statusText
                }
            }
        );

        console.log(`✅ Voice status ${statusText ? 'set' : 'cleared'}: ${statusText || '(empty)'}`);
    } catch (err) {
        console.error("[VoiceStatus Error]", err.message);
        if (err.status === 403) {
            console.error("  → Bot is missing SET_VOICE_CHANNEL_STATUS permission");
        }
    }
}

module.exports = setVoiceStatus;