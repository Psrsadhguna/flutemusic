const db = require("./premiumDB");

function isPremium(userId) {
    return new Promise((resolve) => {
        db.get(
            "SELECT * FROM premium_users WHERE userId = ?",
            [userId],
            (err, row) => {
                if (!row) return resolve(false);

                if (Date.now() > row.expiry)
                    return resolve(false);

                resolve(true);
            }
        );
    });
}

module.exports = { isPremium };