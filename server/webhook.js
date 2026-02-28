const express = require("express");
const crypto = require("crypto");
const paymentUtils = require("../utils/paymentUtils");
const { normalizePlan } = require("../utils/premiumPlans");
const { syncPremiumRoleForUser } = require("../premium/roleSystem");

const router = express.Router();

function signaturesMatch(signature, expected) {
  if (!signature || !expected) {
    return false;
  }

  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expected, "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

router.post("/razorpay", async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.warn("RAZORPAY_WEBHOOK_SECRET is missing");
      return res.sendStatus(500);
    }

    const signature = req.headers["x-razorpay-signature"];
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body || {}));

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (!signaturesMatch(signature, expected)) {
      console.log("Invalid webhook signature");
      return res.sendStatus(400);
    }

    const body = JSON.parse(rawBody.toString("utf8"));
    if (body?.event !== "payment.captured") {
      return res.sendStatus(200);
    }

    const payment = body?.payload?.payment?.entity;
    if (!payment) {
      console.warn("Webhook missing payment payload");
      return res.sendStatus(200);
    }

    const notes = payment.notes || {};
    const discordId = notes.discord_id || notes.userId || notes.user_id;

    if (!discordId) {
      console.log("No Discord user ID in Razorpay notes");
      return res.sendStatus(200);
    }

    const saved = paymentUtils.addPremiumUser(
      discordId,
      payment.email || notes.email || "",
      normalizePlan(notes.plan),
      payment.id,
      payment.amount
    );

    if (global.discordClient) {
      await syncPremiumRoleForUser(global.discordClient, discordId, true);
    }

    console.log(`Premium activated via webhook for ${discordId} (${saved.plan})`);
    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    return res.sendStatus(500);
  }
});

module.exports = router;
