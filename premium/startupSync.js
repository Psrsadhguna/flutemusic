const paymentUtils = require("../utils/paymentUtils");
const { syncPremiumRoleForUser } = require("./roleSystem");

async function startupPremiumSync(client) {
  try {
    paymentUtils.cleanupExpiredPremiums();

    const users = paymentUtils.getAllPremiumUsers();
    const userIds = Object.keys(users);

    for (const userId of userIds) {
      const shouldHaveRole = users[userId]?.isActive === true;
      await syncPremiumRoleForUser(client, userId, shouldHaveRole);
    }

    console.log(`Premium startup sync done (${userIds.length} users checked)`);
  } catch (error) {
    console.error("Premium startup sync failed:", error.message);
  }
}

module.exports = { startupPremiumSync };
