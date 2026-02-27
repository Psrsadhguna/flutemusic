const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const db = require("../premium/premiumDB");
const { syncPremiumRoleForUser } =
  require("../premium/syncPremiumRole");

router.post("/razorpay", async (req, res) => {
  try {

    // =========================
    // VERIFY SIGNATURE
    // =========================
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const signature = req.headers["x-razorpay-signature"];

    const expected = crypto
      .createHmac("sha256", secret)
      .update(req.body)
      .digest("hex");

    if (signature !== expected) {
      console.log("❌ Invalid webhook signature");
      return res.sendStatus(400);
    }

    // RAW → JSON
    const body = JSON.parse(req.body.toString());

    console.log("✅ Webhook received:", body.event);

    if (body.event !== "payment.captured")
      return res.sendStatus(200);

    const payment = body.payload.payment.entity;

    const discordId = payment.notes?.discord_id;

    if (!discordId) {
      console.log("❌ No discord_id in payment notes");
      return res.sendStatus(200);
    }

    console.log(`⭐ Premium activated for ${discordId}`);

    // =========================
    // SAVE PREMIUM
    // =========================

    const expiry =
      Date.now() + 30 * 24 * 60 * 60 * 1000;

    db.run(
      `INSERT OR REPLACE INTO premium_users (userId, expiry)
       VALUES (?, ?)`,
      [discordId, expiry]
    );

    // =========================
    // ADD DISCORD ROLE
    // =========================

    if (global.discordClient) {
      await syncPremiumRoleForUser(
        global.discordClient,
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