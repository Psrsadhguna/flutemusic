const messages = require('../utils/messages.js');
const config = require('../config.js');

module.exports = {
    name: 'help',
    aliases: ['h',],
    description: 'Show this help message',
    usage: 'fhelp',
    execute: async (message, args, client) => {
        const prefix = config.prefix || 'f';

        // If user requested a specific command, show detailed info
        if (args && args[0]) {
            const name = args[0].toLowerCase();
            const cmd = client.commands.get(name);
            if (!cmd) return messages.error(message.channel, `❌ Command not found: ${name}`);

            const title = `Command: ${prefix}${cmd.name}`;
            const description = cmd.description || 'No description available.';
            const usage = cmd.usage ? `Usage: \`${prefix}${cmd.usage}\`` : `Usage: \`${prefix}${cmd.name}\``;

            return messages.info(message.channel, title, `${description}\n\n${usage}`);
        }

        // Build categorized lists from the loaded commands (fallback to sensible defaults)
        const normalList = ['botinfo', 'feedback', 'help', 'ping', 'invite', 'uptime'];
        const musicList = ['play', 'pause', 'resume', 'skip', 'stop', 'queue', 'volume', 'loop', 'shuffle', 'seek', 'clearqueue', 'join', 'move', 'remove', 'nowplaying', 'lyrics', '247'];
        const playlistList = ['saveplaylist', 'loadplaylist', 'myplaylists', 'deleteplaylist'];
        const userList = ['favorite', 'history', 'topac'];
        const filterList = ['bassboost', 'nightcore', 'vaporwave', '8d', 'karaoke', 'tremolo', 'vibrato', 'slowmode', 'daycore', 'darthvader', 'doubletime', 'pop', 'soft', 'treblebass', 'chipmunkfilter', 'clearfilters'];
        const effectList = ['lofi', 'underwater', 'telephone', 'party', 'radio', 'cinema', 'vocalboost', 'echo', 'earrape', 'cleareffects'];

        const helpData = {
            prefix,
            normalCommands: normalList.filter(n => client.commands.has(n)),
            musicCommands: musicList.filter(n => client.commands.has(n)),
            playlistCommands: playlistList.filter(n => client.commands.has(n)),
            userCommands: userList.filter(n => client.commands.has(n)),
            filterCommands: filterList.filter(n => client.commands.has(n)),
            effectCommands: effectList.filter(n => client.commands.has(n))
        };

        messages.help(message.channel, helpData, message.author);
    }
};
