const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const db = require("../premium/premiumDB");
const { syncPremiumRoleForUser } =
require("../premium/syncPremiumRole");

router.post("/razorpay", express.raw({ type: "*/*" }), async (req, res) => {
  try {

    console.log("✅ Webhook received");

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const signature = req.headers["x-razorpay-signature"];

    const expected = crypto
      .createHmac("sha256", secret)
      .update(req.body)
      .digest("hex");

    if (signature !== expected) {
      console.log("❌ Invalid signature");
      return res.sendStatus(400);
    }

    const data = JSON.parse(req.body.toString());
    const event = data.event;

    console.log("Event:", event);

    if (event === "payment.captured") {

      const payment = data.payload.payment.entity;
      const userId = payment.notes.discord_id;

      if (!userId) {
        console.log("❌ No discord_id in payment notes");
        return res.sendStatus(200);
      }

      const expiry = Date.now() + (30 * 24 * 60 * 60 * 1000);

      db.run(
        `INSERT OR REPLACE INTO premium_users (userId, expiry)
         VALUES (?, ?)`,
        [userId, expiry]
      );

      await syncPremiumRoleForUser(
        global.discordClient,
        userId,
        true
      );

      console.log(`⭐ Premium activated for ${userId}`);
    }

    res.sendStatus(200);

  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

module.exports = router;