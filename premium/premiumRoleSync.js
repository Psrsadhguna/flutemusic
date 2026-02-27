function parseGuildIds() {
    const single =
        process.env.PREMIUM_GUILD_ID ||
        process.env.GUILD_ID;

    return single ? [single] : [];
}

async function syncPremiumRoleForUser(client, userId, shouldHaveRole) {

    const roleId = process.env.PREMIUM_ROLE_ID;
    const guildIds = parseGuildIds();

    for (const guildId of guildIds) {

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        try {
            const member = await guild.members.fetch(userId).catch(()=>null);
            if (!member) continue;

            const hasRole = member.roles.cache.has(roleId);

            if (shouldHaveRole && !hasRole)
                await member.roles.add(roleId, "Premium Activated");

            if (!shouldHaveRole && hasRole)
                await member.roles.remove(roleId, "Premium Expired");

        } catch(e){
            console.log("Role sync error:", e.message);
        }
    }
}

module.exports = { syncPremiumRoleForUser };