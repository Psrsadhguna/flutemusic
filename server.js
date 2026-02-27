const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const crypto = require('crypto');
require('dotenv').config();

const Razorpay = require('razorpay');
const paymentUtils = require('./utils/paymentUtils');
const webhookNotifier = require('./utils/webhookNotifier');

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'website')));

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

// Payment plans
const plans = {
  monthly: {
    name: 'Monthly Premium',
    amount: 29900, // ₹299 in paise
    currency: 'INR',
    description: '1 month of premium features'
  },
  lifetime: {
    name: 'Lifetime Premium',
    amount: 99900, // ₹999 in paise
    currency: 'INR',
    description: 'Lifetime premium access'
  }
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'index.html'));
});

app.get('/premium', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'premium.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'premium-dashboard.html'));
});

// Create Razorpay Order
app.post('/api/create-order', async (req, res) => {
  try {
    const { plan, userEmail, userId } = req.body;

    if (!plan || !plans[plan]) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    if (!userEmail || !userId) {
      return res.status(400).json({ error: 'Email and User ID are required' });
    }

    const planData = plans[plan];

    const orderOptions = {
      amount: planData.amount,
      currency: planData.currency,
      receipt: `receipt_${Date.now()}`,
      description: planData.description,
      customer_notify: 1,
      notes: {
        plan: plan,
        userEmail: userEmail,
        userId: userId
      }
    };

    const order = await razorpay.orders.create(orderOptions);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order', details: error.message });
  }
});

// Verify Payment
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { paymentId, orderId, signature } = req.body;

    if (!paymentId || !orderId || !signature) {
      return res.status(400).json({ error: 'Missing payment details' });
    }

    // Verify signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (generated_signature !== signature) {
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    // Optionally fetch payment details to verify
    const payment = await razorpay.payments.fetch(paymentId);

    if (payment.status === 'captured') {
      const userEmail = payment.notes?.userEmail;
      const userId = payment.notes?.userId;
      const plan = payment.notes?.plan;

      // Add user to premium database
      const premiumUser = paymentUtils.addPremiumUser(userId, userEmail, plan, paymentId, payment.amount);

      console.log(`✅ Premium access granted to ${userId} (${plan} plan)`);

      // Send webhook notification
      await webhookNotifier.notifyNewPremium(
        process.env.WEBHOOK_URL,
        userId,
        userEmail,
        plan,
        payment.amount
      );

      // TODO: Grant premium role in Discord bot
      // Example: client.guilds.cache.forEach(guild => {
      //   const member = guild.members.cache.get(userId);
      //   if (member && premiumRole) member.roles.add(premiumRole);
      // });

      res.json({
        success: true,
        message: 'Payment verified successfully',
        payment: {
          id: paymentId,
          status: payment.status,
          amount: payment.amount,
          userId: userId,
          plan: plan,
          email: userEmail
        }
      });
    } else {
      res.status(400).json({ success: false, error: 'Payment not captured' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, error: 'Payment verification failed', details: error.message });
  }
});

// Get payment details (for logging/debugging)
app.get('/api/payment/:paymentId', async (req, res) => {
  try {
    const payment = await razorpay.payments.fetch(req.params.paymentId);
    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payment details' });
  }
});

// Get premium status for a user
app.get('/api/premium-status/:userId', (req, res) => {
  try {
    const userId = req.params.userId;
    const isPremium = paymentUtils.isPremium(userId);
    const userDetails = paymentUtils.getPremiumUser(userId);

    res.json({
      success: true,
      userId: userId,
      isPremium: isPremium,
      details: userDetails || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch premium status' });
  }
});

// Get premium stats (admin only - you should add authorization checks)
app.get('/api/premium-stats', (req, res) => {
  try {
    const stats = paymentUtils.getPremiumStats();
    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get all active premium users
app.get('/api/premium-users', (req, res) => {
  try {
    const allUsers = paymentUtils.getAllPremiumUsers();
    const activeUsers = {};
    
    for (const userId in allUsers) {
      const user = allUsers[userId];
      if (user.isActive) {
        activeUsers[userId] = {
          email: user.email,
          plan: user.plan,
          expiresAt: user.expiresAt,
          purchasedAt: user.purchasedAt
        };
      }
    }

    res.json({
      success: true,
      totalActive: Object.keys(activeUsers).length,
      users: activeUsers
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch premium users' });
  }
});

// Send premium users to webhook
app.post('/api/webhook-premium-users', async (req, res) => {
  try {
    const stats = paymentUtils.getPremiumStats();
    
    // Send webhook notification
    const sent = await webhookNotifier.notifyPremiumStats(
      process.env.WEBHOOK_URL,
      stats
    );

    res.json({
      success: sent,
      message: sent ? 'Webhook notification sent' : 'Failed to send webhook'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send webhook' });
  }
});

// Get premium user activity log
app.get('/api/premium-log', (req, res) => {
  try {
    const allUsers = paymentUtils.getAllPremiumUsers();
    const log = [];

    for (const userId in allUsers) {
      const user = allUsers[userId];
      log.push({
        userId: userId,
        email: user.email,
        plan: user.plan,
        status: user.isActive ? '✅ Active' : '❌ Inactive',
        purchasedAt: user.purchasedAt,
        expiresAt: user.expiresAt || 'Never (Lifetime)'
      });
    }

    res.json({
      success: true,
      totalRecords: log.length,
      log: log.sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

app.listen(port, () => {
  console.log(`Website server listening on port ${port}`);
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.warn('⚠️ WARNING: Razorpay credentials not found. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
  }
  console.log('📝 Premium database: premium_users.json');
});
