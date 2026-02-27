const { getDB, saveDB, syncPremiumRoleForUser } =
require("./syncPremiumRole");

function startPremiumExpiryChecker(client) {

    setInterval(async () => {

        const db = getDB();
        const now = Date.now();

        for (const userId in db) {

            if (db[userId].expiresAt <= now) {

                console.log("⌛ Premium expired:", userId);

                await syncPremiumRoleForUser(client, userId, false);

                delete db[userId];
            }
        }

        saveDB(db);

    }, 60000); // every 1 min
}

module.exports = { startPremiumExpiryChecker };