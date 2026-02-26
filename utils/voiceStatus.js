async function setVoiceStatus(channel, text) {
    if (!channel) return;

    try {
        await channel.setStatus(text);
        console.log("Voice status set:", text);
    } catch (err) {
        console.error("Voice status error:", err.message);
    }
}

module.exports = setVoiceStatus;