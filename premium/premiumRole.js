

async function givePremiumRole(client, userId) {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);

        const member = await guild.members.fetch(userId)
            .catch(() => null);

        if (!member) {
            console.log("User not in guild:", userId);
            return;
        }

        await member.roles.add(process.env.PREMIUM_ROLE_ID);

        console.log("⭐ Premium role added:", userId);

    } catch (err) {
        console.log("Role add error:", err.message);
    }
}

async function removePremiumRole(client, userId) {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);

        const member = await guild.members.fetch(userId)
            .catch(() => null);

        if (!member) return;

        await member.roles.remove(process.env.PREMIUM_ROLE_ID);

        console.log("❌ Premium role removed:", userId);

    } catch (err) {
        console.log(err.message);
    }
}

module.exports = {
    givePremiumRole,
    removePremiumRole
};