require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const db = require("../premium/premiumDB");

const app = express();

/*
IMPORTANT:
Razorpay requires RAW body for signature validation
*/
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const PORT = process.env.PORT || 3000;

/* ===============================
   WEBHOOK ENDPOINT
=================================*/
app.post("/webhook/razorpay", (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const signature = req.headers["x-razorpay-signature"];

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(req.rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.log("❌ Invalid webhook signature");
      return res.status(400).send("Invalid signature");
    }

    const event = req.body.event;

    console.log("✅ Webhook Event:", event);

    /* ===============================
       PAYMENT SUCCESS
    =================================*/
    if (event === "payment.captured") {
      const payment = req.body.payload.payment.entity;

      // IMPORTANT:
      // Put Discord ID in Razorpay notes
      const discordId = payment.notes.discord_id;

      if (!discordId) {
        console.log("No discord_id found");
        return res.sendStatus(200);
      }

      const expiry =
        Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

      db.run(
        `INSERT OR REPLACE INTO premium_users (userId, expiry)
         VALUES (?, ?)`,
        [discordId, expiry],
        (err) => {
          if (err) console.log(err);
          else
            console.log(
              `⭐ Premium activated for ${discordId}`
            );
        }
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

/* =============================== */

app.listen(PORT, () => {
  console.log(`🚀 Razorpay webhook running on ${PORT}`);
});