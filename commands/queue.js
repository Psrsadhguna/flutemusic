const messages = require('../utils/messages.js');

module.exports = {
    name: 'queue',
    aliases: ['q'],
    description: 'Show the current queue',
    usage: 'fqueue',
    execute: async (message, args, client) => {
        const player = client.riffy.players.get(message.guild.id);
        if (!player) return messages.error(message.channel, "Nothing is playing!");
        
        const queue = player.queue;
        if (!queue.length && !player.queue.current) {
            return messages.error(message.channel, "Queue is empty! Add some tracks with the play command.");
        }

        messages.queueList(message.channel, queue, player.queue.current);
    }
};
