const express = require("express");
const crypto = require("crypto");
const db = require("../premium/premiumDB");
const { syncPremiumRoleForUser } =
  require("../premium/syncPremiumRole");

const router = express.Router();

router.post("/razorpay", async (req, res) => {
  try {
    console.log("✅ Webhook received");

    const event = req.body.event;
    console.log("Event:", event);

    let discordId = null;

    // ===============================
    // PAYMENT (Normal Orders)
    // ===============================
    if (event === "payment.captured") {
      const payment = req.body.payload.payment.entity;

      discordId =
        payment.notes?.discord_id ||
        payment.order_id; // fallback
    }

    // ===============================
    // SUBSCRIPTION EVENTS ⭐
    // ===============================
    if (
      event === "subscription.activated" ||
      event === "subscription.charged"
    ) {
      const subscription =
        req.body.payload.subscription.entity;

      discordId = subscription.notes?.discord_id;
    }

    // ===============================
    // CHECK DISCORD ID
    // ===============================
    if (!discordId) {
      console.log("❌ No discord_id in payment notes");
      return res.sendStatus(200);
    }

    console.log("⭐ Premium activated for", discordId);

    // 30 days premium
    const expiry =
      Date.now() + 30 * 24 * 60 * 60 * 1000;

    db.run(
      `INSERT OR REPLACE INTO premium_users (userId, expiry)
       VALUES (?, ?)`,
      [discordId, expiry]
    );

    // ===============================
    // ADD ROLE IN DISCORD
    // ===============================
    const client = global.discordClient;

    if (client) {
      await syncPremiumRoleForUser(
        client,
        discordId,
        true
      );
      console.log("✅ Premium role synced");
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

module.exports = router;