const db = require("./premiumDB");

function upsertPremiumUser(userId, expiry) {
    return new Promise((resolve, reject) => {
        db.run(
            "INSERT OR REPLACE INTO premium_users(userId, expiry) VALUES (?, ?)",
            [userId, expiry],
            function onComplete(err) {
                if (err) return reject(err);
                resolve({ changes: this.changes });
            }
        );
    });
}

function removePremiumUser(userId) {
    return new Promise((resolve, reject) => {
        db.run(
            "DELETE FROM premium_users WHERE userId = ?",
            [userId],
            function onComplete(err) {
                if (err) return reject(err);
                resolve({ changes: this.changes });
            }
        );
    });
}

module.exports = {
    upsertPremiumUser,
    removePremiumUser
};
