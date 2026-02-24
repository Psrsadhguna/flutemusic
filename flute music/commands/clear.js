const messages = require('../utils/messages.js');

module.exports = {
    name: 'clear',
    description: 'Clear the current queue',
    usage: 'fclear',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "Nothing is playing!");
        if (!player.queue.length) return messages.error(message.channel, "Queue is already empty!");

        player.queue.clear();
        messages.success(message.channel, "Cleared the queue!");
    }
};
