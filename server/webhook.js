const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const paymentUtils = require("../utils/paymentUtils");
const { normalizePlan } = require("../utils/premiumPlans");
const { syncPremiumRoleForUser } = require("../premium/roleSystem");

const router = express.Router();

let razorpayClient = null;

function signaturesMatch(signature, expected) {
  if (!signature || !expected) {
    return false;
  }

  const left = Buffer.from(String(signature), "utf8");
  const right = Buffer.from(String(expected), "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function getRazorpayClient() {
  if (razorpayClient) {
    return razorpayClient;
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }

  razorpayClient = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  return razorpayClient;
}

function isLikelyDiscordId(value) {
  return /^[0-9]{15,22}$/.test(String(value || "").trim());
}

function extractDiscordId(notes) {
  const safeNotes = notes || {};
  const candidate =
    safeNotes.discord_id ||
    safeNotes.userId ||
    safeNotes.user_id ||
    safeNotes.discordId;

  if (!isLikelyDiscordId(candidate)) {
    return null;
  }

  return String(candidate).trim();
}

async function fetchOrderNotes(orderId) {
  const client = getRazorpayClient();
  if (!client || !orderId) {
    return {};
  }

  try {
    const order = await client.orders.fetch(orderId);
    return order?.notes || {};
  } catch (error) {
    console.warn(`Unable to fetch Razorpay order notes for ${orderId}:`, error.message);
    return {};
  }
}

async function fetchSubscriptionNotes(subscriptionId) {
  const client = getRazorpayClient();
  if (!client || !subscriptionId) {
    return {};
  }

  try {
    const subscription = await client.subscriptions.fetch(subscriptionId);
    return subscription?.notes || {};
  } catch (error) {
    console.warn(`Unable to fetch Razorpay subscription notes for ${subscriptionId}:`, error.message);
    return {};
  }
}

async function resolveWebhookIdentity(payment, subscription) {
  const noteSources = [];

  if (payment?.notes && typeof payment.notes === "object") {
    noteSources.push({ source: "payment.notes", notes: payment.notes });
  }

  if (subscription?.notes && typeof subscription.notes === "object") {
    noteSources.push({ source: "subscription.notes(payload)", notes: subscription.notes });
  }

  if (payment?.order_id) {
    const orderNotes = await fetchOrderNotes(payment.order_id);
    if (Object.keys(orderNotes).length > 0) {
      noteSources.push({ source: "order.notes", notes: orderNotes });
    }
  }

  const subscriptionId = payment?.subscription_id || subscription?.id;
  if (subscriptionId) {
    const subNotes = await fetchSubscriptionNotes(subscriptionId);
    if (Object.keys(subNotes).length > 0) {
      noteSources.push({ source: "subscription.notes(api)", notes: subNotes });
    }
  }

  let discordId = null;
  let discordSource = "none";
  for (const sourceEntry of noteSources) {
    const found = extractDiscordId(sourceEntry.notes);
    if (found) {
      discordId = found;
      discordSource = sourceEntry.source;
      break;
    }
  }

  const mergedNotes = {};
  for (const sourceEntry of noteSources) {
    Object.assign(mergedNotes, sourceEntry.notes || {});
  }

  return {
    discordId,
    discordSource,
    mergedNotes,
    plan: normalizePlan(mergedNotes.plan),
    email: payment?.email || mergedNotes.email || "",
    paymentId: payment?.id || null,
    amount: payment?.amount || 0,
    orderId: payment?.order_id || null,
    subscriptionId: payment?.subscription_id || subscription?.id || null
  };
}

async function activatePremiumFromWebhook(event, eventId, payment, subscription) {
  const resolved = await resolveWebhookIdentity(payment, subscription);

  if (!resolved.discordId) {
    console.log(
      `[Webhook ${event}] No Discord ID in notes (eventId=${eventId}, paymentId=${resolved.paymentId || "n/a"}, orderId=${resolved.orderId || "n/a"}, subscriptionId=${resolved.subscriptionId || "n/a"})`
    );
    return false;
  }

  const paymentIdForStore =
    resolved.paymentId ||
    `${eventId || "evt"}_${resolved.subscriptionId || Date.now()}`;

  const saved = paymentUtils.addPremiumUser(
    resolved.discordId,
    resolved.email,
    resolved.plan,
    paymentIdForStore,
    resolved.amount
  );

  if (global.discordClient) {
    await syncPremiumRoleForUser(global.discordClient, resolved.discordId, true);
  }

  console.log(
    `Premium activated via webhook for ${resolved.discordId} (${saved.plan}) from ${resolved.discordSource}`
  );

  return true;
}

router.post("/razorpay", async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.warn("RAZORPAY_WEBHOOK_SECRET is missing");
      return res.sendStatus(500);
    }

    const signature = req.headers["x-razorpay-signature"];
    const eventId = req.headers["x-razorpay-event-id"] || `evt_${Date.now()}`;
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
    const event = body?.event;

    if (!event) {
      return res.sendStatus(200);
    }

    if (event === "payment.captured") {
      const payment = body?.payload?.payment?.entity;
      if (!payment) {
        return res.sendStatus(200);
      }

      await activatePremiumFromWebhook(event, eventId, payment, null);
      return res.sendStatus(200);
    }

    if (event === "subscription.charged") {
      const payment = body?.payload?.payment?.entity || null;
      const subscription = body?.payload?.subscription?.entity || null;
      await activatePremiumFromWebhook(event, eventId, payment, subscription);
      return res.sendStatus(200);
    }

    if (event === "subscription.activated") {
      const subscription = body?.payload?.subscription?.entity;
      const subId = subscription?.id || "unknown";
      const subDiscordId = extractDiscordId(subscription?.notes || {});
      console.log(
        `Subscription activated: ${subId} (discordId=${subDiscordId || "missing"})`
      );
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error.message);
    return res.sendStatus(500);
  }
});

module.exports = router;
