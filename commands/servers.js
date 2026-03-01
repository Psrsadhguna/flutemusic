const messages = require('../utils/messages.js');
const config = require('../config.js');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
let Canvas;
try { Canvas = require('canvas'); } catch (e) { Canvas = null; }

module.exports = {
    name: 'servers',
    aliases: ['fservers', 'fserver', 'ss', 'serverlist'],
    description: 'Owner-only: show current guilds where bot is active (name, members, invite, icon).',
    usage: 'fservers',
    execute: async (message, args, client) => {
        const owners = Array.isArray(config.owners)
            ? config.owners
            : (config.owner ? [config.owner] : (config.ownerID ? [config.ownerID] : []));

        if (!owners.includes(message.author.id)) {
            return messages.error(message.channel, '❌ Only the bot owner can use this command.');
        }

        const guilds = client.guilds.cache;
        const totalServers = guilds.size;
        const totalMembers = guilds.reduce((sum, g) => sum + (g.memberCount || 0), 0);

        // Build a single combined embed listing all guilds
        const allGuilds = Array.from(guilds.values());
        const header = `Total servers: ${totalServers}\nTotal members: ${totalMembers}\n\n`;

        const lines = [];
        for (const guild of allGuilds) {
            let inviteText = 'No invite available';
            try {
                const channel = guild.channels.cache.find(c => {
                    const t = c.type || (c.type && c.type.toString && c.type.toString());
                    const isText = t === 'GUILD_TEXT' || t === 'text';
                    if (!isText) return false;
                    try { return c.permissionsFor(client.user).has('CREATE_INSTANT_INVITE'); } catch { return false; }
                });
                if (channel) {
                    const inv = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: false });
                    inviteText = `https://discord.gg/${inv.code}`;
                }
            } catch (e) {
                // ignore invite creation errors
            }

            const icon = guild.iconURL ? guild.iconURL({ dynamic: true, size: 64 }) : null;
            const safeName = guild.name.replace(/\*/g, '\\*').replace(/`/g, '\\`');
            const line = `• ${safeName} — ${guild.memberCount || 'N/A'} members — ${inviteText}${icon ? ` — ${icon}` : ''}`;
            lines.push(line);
        }

        let description = header + lines.join('\n');
        // Discord embed description max length is 4096 characters
        const MAX_DESC = 4000;
        if (description.length > MAX_DESC) {
            description = description.slice(0, MAX_DESC - 100) + '\n\n...output truncated';
        }

        const embed = new EmbedBuilder()
            .setTitle('Servers — Current Bot Guilds')
            .setColor(config.embedColor)
            .setDescription(description)
            .setTimestamp()
            .setFooter({ text: `Showing ${allGuilds.length} servers` });

        // Attempt to generate a grid image of server icons and attach it
        try {
            if (Canvas) {
                // collect up to 49 guilds and fetch their icons or generate placeholders
                const candidateGuilds = allGuilds.slice(0, 49);
                const loadPromises = candidateGuilds.map(async (g) => {
                    try {
                        const url = (typeof g.iconURL === 'function') ? g.iconURL({ dynamic: true, size: 128 }) : null;
                        if (url) {
                            const res = await axios.get(url, { responseType: 'arraybuffer' });
                            const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data);
                            return await Canvas.loadImage(buf);
                        }
                        // generate placeholder with guild initials
                        const size = 128;
                        const c = Canvas.createCanvas(size, size);
                        const ctx = c.getContext('2d');
                        // background color based on guild id
                        const colorSeed = parseInt((g.id || '0').slice(-6), 10) || Math.floor(Math.random() * 0xffffff);
                        const bg = `#${(colorSeed & 0xFFFFFF).toString(16).padStart(6, '0')}`;
                        ctx.fillStyle = bg;
                        ctx.fillRect(0, 0, size, size);
                        // initials
                        const words = (g.name || '').split(/\s+/).filter(Boolean);
                        let initials = (words[0] && words[0][0]) || '';
                        if (words.length > 1) initials += (words[1][0] || '');
                        initials = initials.substring(0, 2).toUpperCase();
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 56px Sans';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(initials || '#', size / 2, size / 2 + 4);
                        const buf = c.toBuffer('image/png');
                        return await Canvas.loadImage(buf);
                    } catch (err) {
                        console.warn('Failed to fetch or create icon for guild', g.id, err?.message || err);
                        return null;
                    }
                });

                const results = await Promise.allSettled(loadPromises);
                const images = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);

                if (images.length > 0) {
                    const thumb = 128;
                    const cols = Math.min(7, Math.ceil(Math.sqrt(images.length)));
                    const rows = Math.ceil(images.length / cols);
                    const padding = 8;
                    const canvas = Canvas.createCanvas(cols * (thumb + padding) + padding, rows * (thumb + padding) + padding);
                    const ctx = canvas.getContext('2d');
                    // background
                    ctx.fillStyle = '#0f1720';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    for (let i = 0; i < images.length; i++) {
                        const img = images[i];
                        const x = padding + (i % cols) * (thumb + padding);
                        const y = padding + Math.floor(i / cols) * (thumb + padding);
                        ctx.drawImage(img, x, y, thumb, thumb);
                    }

                    const buffer = canvas.toBuffer('image/png');
                    const attachment = new AttachmentBuilder(buffer, { name: 'servers-grid.png' });
                    embed.setImage('attachment://servers-grid.png');
                    await message.channel.send({ embeds: [embed], files: [attachment] });
                    return;
                } else {
                    console.log('No images successfully loaded for server icons');
                }
            } else {
                console.log('Canvas module not available; cannot generate icons grid');
            }
        } catch (e) {
            console.error('Server icons grid generation failed:', e?.stack || e);
            try { await message.channel.send({ content: '⚠️ Failed to generate server icons image, sending list without logos.' }); } catch {};
        }

        // Fallback: send embed without image
        try {
            await message.channel.send({ embeds: [embed] });
        } catch (e) {
            messages.error(message.channel, 'Failed to send server list embed');
        }
    }
};
