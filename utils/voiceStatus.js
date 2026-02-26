async function setVoiceStatus(channel, text) {
    if (!channel) return;

    try {
        await channel.setStatus(text);
        console.log("[VoiceStatus] Updated:", text);
    } catch (err) {
        console.error("[VoiceStatus Error]", err.message);
    }
}

module.exports = setVoiceStatus;