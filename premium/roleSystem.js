function parseGuildIds() {
    const multi = process.env.PREMIUM_ROLE_GUILD_IDS;
    if (multi) {
        return multi
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
    }

    const single =
        process.env.PREMIUM_GUILD_ID ||
        process.env.PREMIUM_ROLE_GUILD_ID ||
        process.env.GUILD_ID;
    return single ? [single] : [];
}

async function syncInGuild(guild, userId, roleId, shouldHavePremiumRole) {
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) return { status: "missing_role", guildId: guild.id };

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member) return { status: "not_member", guildId: guild.id };

    const hasRole = member.roles.cache.has(roleId);

    if (shouldHavePremiumRole) {
        if (hasRole) return { status: "unchanged", guildId: guild.id };
        await member.roles.add(roleId, "Premium activated");
        return { status: "added", guildId: guild.id };
    }

    if (!hasRole) return { status: "unchanged", guildId: guild.id };
    await member.roles.remove(roleId, "Premium revoked");
    return { status: "removed", guildId: guild.id };
}

async function syncPremiumRoleForUser(client, userId, shouldHavePremiumRole) {
    const roleId = process.env.PREMIUM_ROLE_ID;
    if (!roleId) {
        return { ok: false, reason: "PREMIUM_ROLE_ID_MISSING" };
    }

    const configuredGuildIds = parseGuildIds();
    const guilds = configuredGuildIds.length
        ? configuredGuildIds
            .map((guildId) => client.guilds.cache.get(guildId))
            .filter(Boolean)
        : Array.from(client.guilds.cache.values());

    if (!guilds.length) {
        return { ok: false, reason: "NO_TARGET_GUILDS" };
    }

    const results = [];
    for (const guild of guilds) {
        try {
            const result = await syncInGuild(guild, userId, roleId, shouldHavePremiumRole);
            results.push(result);
        } catch (error) {
            results.push({ status: "error", guildId: guild.id, error: error.message });
        }
    }

    return { ok: true, roleId, results };
}

module.exports = {
    syncPremiumRoleForUser
};
