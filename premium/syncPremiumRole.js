const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "../database/premium.json");

function getDB() {
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "{}");
    return JSON.parse(fs.readFileSync(dbPath));
}

function saveDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

async function syncPremiumRoleForUser(client, userId, active) {

    const guild = client.guilds.cache.get(process.env.PREMIUM_GUILD_ID);
    if (!guild) return;

    const member = await guild.members.fetch(userId).catch(()=>null);
    if (!member) return;

    const roleId = process.env.PREMIUM_ROLE_ID;

    if (active)
        await member.roles.add(roleId).catch(()=>{});
    else
        await member.roles.remove(roleId).catch(()=>{});
}

module.exports = {
    getDB,
    saveDB,
    syncPremiumRoleForUser
};