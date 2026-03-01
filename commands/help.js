const messages = require('../utils/messages.js');
const config = require('../config.js');

const CATEGORY_MAP = {
    normal: ['botinfo', 'feedback', 'help', 'invite', 'ping', 'premium', 'report', 'servers', 'status', 'uptime', 'website'],
    music: ['247', 'autoplay', 'clear', 'clearqueue', 'loop', 'move', 'nowplaying', 'pause', 'play', 'previous', 'queue', 'remove', 'replay', 'resume', 'seek', 'shuffle', 'skip', 'stop', 'volume'],
    playlist: ['deleteplaylist', 'loadplaylist', 'myplaylists', 'saveplaylist'],
    user: ['campaign', 'favorite', 'history', 'refer', 'topac', 'trial'],
    filter: ['8d', 'chipmunkfilter', 'clearfilters', 'daycore', 'darthvader', 'doubletime', 'equalizer', 'karaoke', 'nightcore', 'pop', 'slowedreverb', 'slowmode', 'soft', 'treblebass', 'tremolo', 'vaporwave', 'vibrato'],
    effect: ['cinema', 'cleareffects', 'echo', 'earrape', 'lofi', 'party', 'radio', 'telephone', 'underwater', 'vocalboost']
};

const USAGE_MAP = {
    play: 'play <link>'
};

const COMMAND_HELP_NOTES = {
    autoplay: [
        'Modes:',
        '- `similar`: similar/related songs',
        '- `artist`: same artist hits',
        '- `random`: random discovery tracks',
        'Examples:',
        '- `fautoplay similar`',
        '- `fautoplay artist`',
        '- `fautoplay random`',
        '- `fautoplay status`'
    ],
    slowedreverb: [
        'Example:',
        '- `fslowedreverb` (toggle ON/OFF)'
    ],
    trial: [
        'Flow:',
        '- `ftrial status`: show starter eligibility + tokens',
        '- `ftrial start`: one-time starter trial',
        '- `ftrial use`: spend 1 token for a trial extension'
    ]
};

function pickCommands(orderedNames, existingSet, usedSet) {
    const picked = [];

    for (const name of orderedNames) {
        if (existingSet.has(name) && !usedSet.has(name)) {
            picked.push(name);
            usedSet.add(name);
        }
    }

    return picked;
}

function formatUsage(prefix, cmd) {
    const raw = String(cmd.usage || cmd.name || '').trim();
    if (!raw) return `Usage: \`${prefix}${cmd.name}\``;

    if (raw.toLowerCase().startsWith(prefix.toLowerCase())) {
        return `Usage: \`${raw}\``;
    }

    return `Usage: \`${prefix}${raw}\``;
}

module.exports = {
    name: 'help',
    aliases: ['h'],
    description: 'Show this help message',
    usage: 'fhelp',
    execute: async (message, args, client) => {
        const prefix = config.prefix || 'f';

        if (args && args[0]) {
            const name = args[0].toLowerCase();
            let cmd = client.commands.get(name);
            if (!cmd) cmd = client.commands.find((c) => Array.isArray(c.aliases) && c.aliases.includes(name));
            if (!cmd) return messages.error(message.channel, `Command not found: ${name}`);

            const title = `Command: ${prefix}${cmd.name}`;
            const description = cmd.description || 'No description available.';
            const usage = formatUsage(prefix, cmd);
            const aliases = Array.isArray(cmd.aliases) && cmd.aliases.length
                ? `Aliases: ${cmd.aliases.map((alias) => `\`${prefix}${alias}\``).join(', ')}`
                : null;
            const notes = COMMAND_HELP_NOTES[cmd.name] || [];

            const details = [
                description,
                '',
                usage
            ];

            if (aliases) {
                details.push(aliases);
            }

            if (notes.length) {
                details.push('', ...notes);
            }

            return messages.info(message.channel, title, details.join('\n'));
        }

        const existingCommands = new Set(client.commands.keys());
        const used = new Set();

        const normalCommands = pickCommands(CATEGORY_MAP.normal, existingCommands, used);
        const musicCommands = pickCommands(CATEGORY_MAP.music, existingCommands, used);
        const playlistCommands = pickCommands(CATEGORY_MAP.playlist, existingCommands, used);
        const userCommands = pickCommands(CATEGORY_MAP.user, existingCommands, used);
        const filterCommands = pickCommands(CATEGORY_MAP.filter, existingCommands, used);
        const effectCommands = pickCommands(CATEGORY_MAP.effect, existingCommands, used);

        const uncategorized = [...existingCommands].filter((name) => !used.has(name)).sort();
        normalCommands.push(...uncategorized);

        const helpData = {
            prefix,
            normalCommands,
            musicCommands,
            playlistCommands,
            userCommands,
            filterCommands,
            effectCommands
        };

        return messages.help(message.channel, helpData, message.author);
    }
};
