// premium/syncPremiumRole.js

async function syncPremiumRoleForUser(client, userId, add = true) {

    try {
        const guild = await client.guilds.fetch(
            process.env.PREMIUM_GUILD_ID
        );

        if (!guild) return "guild_not_found";

        const member = await guild.members.fetch(userId)
            .catch(() => null);

        if (!member) return "user_not_in_server";

        const roleId = process.env.PREMIUM_ROLE_ID;

        if (add) {
            if (!member.roles.cache.has(roleId)) {
                await member.roles.add(roleId);
                return "added";
            }
            return "already_has_role";
        } else {
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                return "removed";
            }
            return "no_role";
        }

    } catch (err) {
        console.error("Role sync error:", err);
        return "error";
    }
}

module.exports = { syncPremiumRoleForUser };