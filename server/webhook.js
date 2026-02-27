require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const db = require("../premium/premiumDB");

const router = express.Router();

router.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

router.post("/razorpay", (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const signature = req.headers["x-razorpay-signature"];

    const expected = crypto
      .createHmac("sha256", secret)
      .update(req.rawBody)
      .digest("hex");

    if (signature !== expected) {
      console.log("❌ Invalid signature");
      return res.sendStatus(400);
    }

    const event = req.body.event;
    console.log("✅ Webhook Event:", event);

    if (event === "payment.captured") {

      const payment = req.body.payload.payment.entity;

      // ⭐ read discord id
      const discordId =
        payment.notes?.discord_id ||
        payment.notes?.userId;

      if (!discordId) {
        console.log("❌ No discord_id found");
        return res.sendStatus(200);
      }

      const expiry =
        Date.now() + 30 * 24 * 60 * 60 * 1000;

      db.run(
        `INSERT OR REPLACE INTO premium_users (userId, expiry)
         VALUES (?, ?)`,
        [discordId, expiry],
        (err) => {
          if (err) console.log(err);
          else console.log(`⭐ Premium activated for ${discordId}`);
        }
      );
    }

    res.sendStatus(200);

  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

module.exports = router;