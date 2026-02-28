const express = require("express");
const path = require("path");
const crypto = require("crypto");
const Razorpay = require("razorpay");
require("dotenv").config();

const paymentUtils = require("./utils/paymentUtils");
const webhookNotifier = require("./utils/webhookNotifier");
const { listPlans, normalizePlan, isTestAmountEnabled } = require("./utils/premiumPlans");
const webhookRoutes = require("./server/webhook");

const app = express();
const port = process.env.PORT || 4000;
const premiumPlans = listPlans();

let razorpayClient = null;

function getRazorpayClient() {
  if (razorpayClient) return razorpayClient;

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("RAZORPAY_NOT_CONFIGURED");
  }

  razorpayClient = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  return razorpayClient;
}

function timingSafeHexEqual(left, right) {
  if (!left || !right) return false;

  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isLikelyDiscordId(userId) {
  return /^[0-9]{15,22}$/.test(String(userId || "").trim());
}

app.use(
  "/webhook",
  express.raw({ type: "application/json" }),
  webhookRoutes
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "website")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "website", "index.html"));
});

app.get("/premium", (req, res) => {
  res.sendFile(path.join(__dirname, "website", "premium.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "website", "premium-dashboard.html"));
});

app.get("/api/premium-plans", (req, res) => {
  const plans = Object.fromEntries(
    Object.entries(premiumPlans).map(([key, value]) => [
      key,
      {
        key: value.key,
        label: value.label,
        amount: value.amount,
        amountInRupees: (value.amount / 100).toFixed(2),
        currency: value.currency,
        description: value.description
      }
    ])
  );

  return res.json({
    success: true,
    testMode: isTestAmountEnabled(),
    plans
  });
});

app.post("/api/create-order", async (req, res) => {
  try {
    const { plan, userId, userEmail } = req.body || {};
    const selectedPlan = String(plan || "monthly").trim().toLowerCase();

    if (!premiumPlans[selectedPlan]) {
      return res.status(400).json({ success: false, error: "Invalid plan" });
    }

    if (!isLikelyDiscordId(userId)) {
      return res.status(400).json({ success: false, error: "Valid Discord ID is required" });
    }

    const clientForPayment = getRazorpayClient();
    const planData = premiumPlans[selectedPlan];

    const order = await clientForPayment.orders.create({
      amount: planData.amount,
      currency: planData.currency,
      receipt: `rcpt_${Date.now()}_${String(userId).slice(-6)}`,
      notes: {
        discord_id: String(userId),
        userId: String(userId),
        email: userEmail || "",
        plan: selectedPlan
      }
    });

    return res.json({
      success: true,
      orderId: order.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    console.error("Create order failed:", error.message);
    const isConfigError = error.message === "RAZORPAY_NOT_CONFIGURED";
    return res.status(500).json({
      success: false,
      error: isConfigError
        ? "Razorpay is not configured on server"
        : "Order creation failed"
    });
  }
});

app.post("/api/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    } = req.body || {};

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, error: "Missing payment verification fields" });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, error: "Razorpay key secret is missing" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (!timingSafeHexEqual(signature, expectedSignature)) {
      return res.status(400).json({ success: false, error: "Invalid payment signature" });
    }

    const clientForPayment = getRazorpayClient();
    const payment = await clientForPayment.payments.fetch(paymentId);
    const paymentNotes = payment.notes || {};
    let mergedNotes = { ...paymentNotes };
    let userId = paymentNotes.discord_id || paymentNotes.userId || paymentNotes.user_id;

    if (!isLikelyDiscordId(userId) && payment.order_id) {
      try {
        const order = await clientForPayment.orders.fetch(payment.order_id);
        const orderNotes = order?.notes || {};
        mergedNotes = { ...orderNotes, ...mergedNotes };
        userId = orderNotes.discord_id || orderNotes.userId || orderNotes.user_id;
      } catch (error) {
        console.warn("Unable to fetch order notes in verify-payment:", error.message);
      }
    }

    if (!isLikelyDiscordId(userId) && payment.subscription_id) {
      try {
        const subscription = await clientForPayment.subscriptions.fetch(payment.subscription_id);
        const subNotes = subscription?.notes || {};
        mergedNotes = { ...subNotes, ...mergedNotes };
        userId = subNotes.discord_id || subNotes.userId || subNotes.user_id;
      } catch (error) {
        console.warn("Unable to fetch subscription notes in verify-payment:", error.message);
      }
    }

    if (!isLikelyDiscordId(userId)) {
      return res.status(400).json({ success: false, error: "Payment does not include a valid Discord ID" });
    }

    const resolvedUserId = String(userId).trim();
    const resolvedEmail = payment.email || mergedNotes.email || "";
    const resolvedPlan = normalizePlan(mergedNotes.plan);

    const premiumUser = paymentUtils.addPremiumUser(
      resolvedUserId,
      resolvedEmail,
      resolvedPlan,
      payment.id,
      payment.amount
    );

    if (process.env.WEBHOOK_URL) {
      webhookNotifier.notifyNewPremium(
        process.env.WEBHOOK_URL,
        resolvedUserId,
        resolvedEmail,
        premiumUser.plan,
        payment.amount
      ).catch((err) => {
        console.error("Premium webhook notify failed:", err.message);
      });
    }

    return res.json({
      success: true,
      message: "Payment verified and premium activated",
      plan: premiumUser.plan,
      expiresAt: premiumUser.expiresAt
    });
  } catch (error) {
    console.error("Verify payment failed:", error.message);
    return res.status(500).json({ success: false, error: "Payment verification failed" });
  }
});

app.get("/api/premium-stats", (req, res) => {
  try {
    const stats = paymentUtils.getPremiumStats();
    return res.json({ success: true, stats });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to fetch premium stats" });
  }
});

app.post("/api/webhook-premium-users", async (req, res) => {
  try {
    const stats = paymentUtils.getPremiumStats();
    const sent = await webhookNotifier.notifyPremiumStats(process.env.WEBHOOK_URL, stats);
    return res.json({ success: sent });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Webhook failed" });
  }
});

app.get("/api/premium-log", (req, res) => {
  try {
    const allUsers = paymentUtils.getAllPremiumUsers();
    const log = Object.entries(allUsers).map(([id, user]) => ({
      userId: id,
      email: user.email || "",
      plan: user.plan || "monthly",
      status: user.isActive ? "Active" : "Inactive",
      purchasedAt: user.purchasedAt,
      expiresAt: user.expiresAt || "Never (Lifetime)"
    }));

    return res.json({
      success: true,
      totalRecords: log.length,
      log: log.sort((a, b) => new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0))
    });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to fetch log" });
  }
});

app.listen(port, () => {
  console.log(`Website running on port ${port}`);

  if (!process.env.RAZORPAY_KEY_ID) {
    console.warn("Razorpay keys are missing");
  }
});
