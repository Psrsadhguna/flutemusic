const paymentUtils = require("../utils/paymentUtils");
const { syncPremiumRoleForUser } = require("./roleSystem");

function startPremiumExpiryChecker(client) {
  setInterval(async () => {
    try {
      const result = paymentUtils.cleanupExpiredPremiums();
      const expiredUserIds = Array.isArray(result?.expiredUserIds)
        ? result.expiredUserIds
        : [];

      for (const userId of expiredUserIds) {
        await syncPremiumRoleForUser(client, userId, false);
      }

      if (expiredUserIds.length > 0) {
        console.log(`Premium expired for ${expiredUserIds.length} user(s)`);
      }
    } catch (error) {
      console.error("Premium expiry checker failed:", error.message);
    }
  }, 60 * 1000);
}

module.exports = { startPremiumExpiryChecker };
