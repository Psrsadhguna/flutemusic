const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const paymentUtils = require("../utils/paymentUtils");
const { syncPremiumRoleForUser } =
require("../premium/syncPremiumRole");

// IMPORTANT → Razorpay needs RAW body
router.post(
  "/razorpay",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    console.log("📩 Webhook received");

    try {
      const signature = req.headers["x-razorpay-signature"];

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(req.body)
        .digest("hex");

      // ✅ Verify webhook
      if (signature !== expectedSignature) {
        console.log("❌ Invalid webhook signature");
        return res.status(400).send("Invalid signature");
      }

      const event = JSON.parse(req.body.toString());

      console.log("Event:", event.event);

      // ==========================
      // ✅ PAYMENT CAPTURED
      // ==========================
      if (event.event === "payment.captured") {

        const payment = event.payload.payment.entity;

        const discordId = payment.notes?.discord_id;
        const plan = payment.notes?.plan || "monthly";

        if (!discordId) {
          console.log("❌ No discord_id in payment notes");
          return res.sendStatus(200);
        }

        console.log(`💰 Payment success for ${discordId}`);

        // ==========================
        // Premium expiry calculation
        // ==========================
        let expiry = null;

        if (plan === "monthly") {
          expiry = Date.now() + (30 * 24 * 60 * 60 * 1000);
        }

        // lifetime = no expiry
        paymentUtils.activatePremium(
          discordId,
          plan,
          expiry
        );

        console.log(`⭐ Premium activated for ${discordId}`);

        // ==========================
        // ✅ ADD DISCORD ROLE
        // ==========================
        try {
          const client = global.discordClient;

          if (!client) {
            console.log("❌ Discord client not ready");
          } else {

            const result =
              await syncPremiumRoleForUser(
                client,
                discordId,
                true
              );

            console.log("🎖 Role sync result:", result);
          }

        } catch (err) {
          console.log("❌ Role sync error:", err.message);
        }
      }

      res.sendStatus(200);

    } catch (error) {
      console.error("Webhook error:", error);
      res.sendStatus(500);
    }
  }
);

module.exports = router;