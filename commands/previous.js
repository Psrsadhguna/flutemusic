const messages = require("../utils/messages.js");

module.exports = {
    name: "previous",
    aliases: ["prev", "back"],
    description: "Play the previously played song in this server",
    usage: "fprevious",
    cooldownMs: 2000,
    execute: async (message, args, client) => {
        const guildId = message.guild.id;
        const history = global.songHistory?.[guildId];

        if (!message.member.voice.channel) {
            return messages.error(message.channel, "Join a voice channel first.");
        }

        if (!history || history.length < 2) {
            return messages.error(message.channel, "No previous track in this server yet.");
        }

        let player = client.riffy.players.get(guildId);
        if (!player) {
            player = client.riffy.createConnection({
                guildId,
                voiceChannel: message.member.voice.channel.id,
                textChannel: message.channel.id,
                deaf: true
            });
        }

        const previousSnapshot = history[history.length - 2];
        if (!previousSnapshot?.info) {
            return messages.error(message.channel, "Could not find previous track data.");
        }

        let trackToPlay = previousSnapshot;
        if (!trackToPlay.track && !trackToPlay.encoded) {
            const uri = previousSnapshot.info.uri;
            const fallbackQuery = uri || `${previousSnapshot.info.title || ""} ${previousSnapshot.info.author || ""}`;
            const resolved = await client.riffy.resolve({
                query: fallbackQuery,
                requester: message.author
            }).catch(() => null);
            trackToPlay = resolved?.tracks?.[0] || null;
        }

        if (!trackToPlay) {
            return messages.error(message.channel, "Failed to load previous song.");
        }

        history.splice(history.length - 2, 1);
        player.queue.unshift(trackToPlay);
        await player.stop();

        return messages.success(message.channel, `Playing previous: ${trackToPlay.info.title}`);
    }
};
