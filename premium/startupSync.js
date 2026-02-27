const { getDB, syncPremiumRoleForUser } =
require("./syncPremiumRole");

async function startupPremiumSync(client) {

    const db = getDB();

    for (const userId in db) {
        await syncPremiumRoleForUser(client, userId, true);
    }

    console.log("✅ Premium startup sync done");
}

module.exports = { startupPremiumSync };