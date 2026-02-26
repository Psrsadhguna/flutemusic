require('dotenv').config();

module.exports = {
    // Support multiple prefixes. `prefixes` is preferred; `prefix` kept for compatibility.
    prefixes: ['f', 'F'],
    prefix: 'f',
    nodes: [{
        host: process.env.LAVALINK_HOST || "",
        password: process.env.LAVALINK_PASSWORD || "",
        port: parseInt(process.env.LAVALINK_PORT) || 443,
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
    feedbackWebhookUrl: process.env.FEEDBACK_WEBHOOK_URL || '',
    // Help command buttons
    supportURL: 'https://discord.gg/v7StyEvCCC', // Support server invite
    voteURL: 'https://top.gg/bot/1474068114373525544/vote', // top.gg vote link
    websiteURL: 'https://flute-music-bot.com', // Your website
    // Bot owner(s) - keep these in your .env as OWNER_ID or OWNERS (comma-separated)
    ownerID: process.env.OWNER_ID || process.env.OWNER || '',
    owners: process.env.OWNERS ? process.env.OWNERS.split(',').map(s => s.trim()) : (process.env.OWNER_ID ? [process.env.OWNER_ID] : [])
    ,
    // When true, automatically add the top recommendation to the queue when recommendations load
    autoAddRecommendation: false
};