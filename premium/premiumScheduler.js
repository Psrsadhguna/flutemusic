const db = require("./premiumDB");
const { removePremiumRole } = require("./premiumRole");

function startPremiumExpiryChecker(client) {

    console.log("⏰ Premium expiry checker started");

    setInterval(() => {

        db.all("SELECT * FROM premium_users", async (err, rows) => {

            if (err || !rows) return;

            for (const user of rows) {

                if (Date.now() > user.expiry) {

                    console.log("Premium expired:", user.userId);

                    // remove role
                    await removePremiumRole(client, user.userId);

                    // remove from DB
                    db.run(
                        "DELETE FROM premium_users WHERE userId=?",
                        [user.userId]
                    );
                }
            }

        });

    }, 300000); // every 5 minutes
}

module.exports = { startPremiumExpiryChecker };