const express = require('express');
const path = require('path');
require('dotenv').config();

const Razorpay = require('razorpay');
const paymentUtils = require('./utils/paymentUtils');
const webhookNotifier = require('./utils/webhookNotifier');

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'website')));

// =======================
// Razorpay Init
// =======================

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// =======================
// Plans
// =======================
const plans = {
  monthly: {
    name: "Monthly Premium",
    amount: 100, // ₹1 test
    currency: "INR"
  },
  lifetime: {
    name: "Lifetime Premium",
    amount: 100,
    currency: "INR"
  }
};

// =======================
// Pages
// =======================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'index.html'));
});

app.get('/premium', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'premium.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'premium-dashboard.html'));
});

// =======================
// CREATE ORDER ✅ FINAL
// =======================

app.post('/api/create-order', async (req, res) => {
  try {

    const { plan, userId, userEmail } = req.body;

    if (!userId)
      return res.status(400).json({ error: "Discord ID missing" });

    if (!plans[plan])
      return res.status(400).json({ error: "Invalid plan" });

    const planData = plans[plan];

    const order = await razorpay.orders.create({
      amount: planData.amount,
      currency: planData.currency,
      receipt: `receipt_${Date.now()}`,

      notes: {
        discord_id: String(userId), // ⭐ REQUIRED
        email: userEmail || "unknown",
        plan: plan
      }
    });

    console.log("✅ Order created for:", userId);

    res.json({
      success: true,
      orderId: order.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency
    });

  } catch (err) {
    console.error("Order Error:", err);
    res.status(500).json({ error: "Order creation failed" });
  }
});
// =======================
// Premium Stats Webhook
// =======================

app.post('/api/webhook-premium-users', async (req, res) => {
  try {
    const stats = paymentUtils.getPremiumStats();

    const sent = await webhookNotifier.notifyPremiumStats(
      process.env.WEBHOOK_URL,
      stats
    );

    res.json({ success: sent });
  } catch (error) {
    res.status(500).json({ error: 'Webhook failed' });
  }
});

// =======================
// Premium Log
// =======================

app.get('/api/premium-log', (req, res) => {
  try {
    const allUsers = paymentUtils.getAllPremiumUsers();

    const log = Object.entries(allUsers).map(([id, user]) => ({
      userId: id,
      email: user.email,
      plan: user.plan,
      status: user.isActive ? '✅ Active' : '❌ Inactive',
      purchasedAt: user.purchasedAt,
      expiresAt: user.expiresAt || 'Lifetime'
    }));

    res.json({
      success: true,
      totalRecords: log.length,
      log: log.sort((a,b)=> new Date(b.purchasedAt)-new Date(a.purchasedAt))
    });

  } catch {
    res.status(500).json({ error: 'Failed to fetch log' });
  }
});

// =======================
// Start Server
// =======================

app.listen(port, () => {
  console.log(`🌐 Website running on port ${port}`);

  if (!process.env.RAZORPAY_KEY_ID)
    console.warn("⚠ Razorpay keys missing");
});