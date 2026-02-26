// utils/voiceStatus.js

async function setVoiceStatus(channel, text) {
    if (!channel || !channel.client) return;

    try {
        // The voice-status endpoint requires MANAGE_GUILD permission
        // Check if bot has the necessary permissions in this guild
        const guild = channel.guild;
        if (!guild) return;

        const botMember = await guild.members.fetch(channel.client.user.id).catch(() => null);
        if (!botMember) {
            console.warn(`[VoiceStatus] Bot is not a member of guild ${guild.id}`);
            return;
        }

        if (!botMember.permissions.has('ManageGuild')) {
            console.warn(`[VoiceStatus] Bot missing MANAGE_GUILD permission in ${guild.name} (${guild.id})`);
            return;
        }

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
        if (err.status === 403) {
            console.error("  → Bot is missing MANAGE_GUILD permission or the guild doesn't support voice status");
        }
    }
}

module.exports = setVoiceStatus;