require('dotenv').config();

module.exports = {
    // Support multiple prefixes. `prefixes` is preferred; `prefix` kept for compatibility.
    prefixes: ['f', 'F'],
    prefix: 'f',
    nodes: [{
        host: process.env.LAVALINK_HOST || "",
        password: process.env.LAVALINK_PASSWORD || "",
        port: parseInt(process.env.LAVALINK_PORT) || 13592,
        secure: process.env.LAVALINK_SECURE === 'true' || false,
        name: "Main Node",
        resume: false
    }],
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    },
    botToken: process.env.BOT_TOKEN,
    embedColor: "#0061ff",
    // Toggle whether the bot should rename voice channels to show the currently playing track
    voiceChannelstatus: true,
    // Webhook URL to receive join/leave notifications. Leave empty to disable.
    webhookUrl: process.env.WEBHOOK_URL || '',
    // Webhook URL to receive bug/feedback reports. Leave empty to disable.
    feedbackWebhookUrl: process.env.FEEDBACK_WEBHOOK_URL || ''
};