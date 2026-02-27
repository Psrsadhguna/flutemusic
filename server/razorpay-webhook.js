/**
 * Razorpay Webhook Handler
 * Handles payment events from Razorpay asynchronously
 * 
 * Setup:
 * 1. Go to Razorpay Dashboard → Settings → Webhooks
 * 2. Add webhook URL: https://your-domain.com/api/razorpay-webhook
 * 3. Select these events:
 *    - payment.authorized
 *    - payment.failed
 *    - payment.captured
 *    - refund.created
 * 4. Copy the webhook secret and add to .env as RAZORPAY_WEBHOOK_SECRET
 */

const express = require('express');
const crypto = require('crypto');
const paymentUtils = require('../utils/paymentUtils');

const router = express.Router();

/**
 * Verify webhook signature from Razorpay
 */
function verifyWebhookSignature(req) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  const signature = req.headers['x-razorpay-signature'];
  const body = req.rawBody || JSON.stringify(req.body);

  const hash = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  return hash === signature;
}

/**
 * Primary webhook handler
 * Receives events from Razorpay
 */
router.post('/razorpay-webhook', (req, res) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      console.warn('⚠️ Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`📬 Webhook Event: ${event}`);

    switch (event) {
      case 'payment.authorized':
        handlePaymentAuthorized(payload);
        break;

      case 'payment.failed':
        handlePaymentFailed(payload);
        break;

      case 'payment.captured':
        handlePaymentCaptured(payload);
        break;

      case 'refund.created':
        handleRefund(payload);
        break;

      default:
        console.log(`ℹ️ Unhandled event: ${event}`);
    }

    // Always return 200 to acknowledge receipt
    res.json({ success: true, event: event });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle payment.authorized event
 * Payment is authorized but not yet captured
 */
function handlePaymentAuthorized(payload) {
  const payment = payload.payment;
  const paymentId = payment.entity.id;
  const amount = payment.entity.amount;
  const email = payment.entity.email;

  console.log(`✅ Payment authorized: ${paymentId} - ₹${amount / 100}`);
  // You might want to store this for manual review
}

/**
 * Handle payment.captured event
 * Payment is fully captured and funds are yours
 */
function handlePaymentCaptured(payload) {
  const payment = payload.payment;
  const paymentId = payment.entity.id;
  const email = payment.entity.email;
  const notes = payment.entity.notes;

  if (notes && notes.userId && notes.plan) {
    const userId = notes.userId;
    const plan = notes.plan;

    // User already added in verify-payment endpoint
    console.log(`💰 Payment captured: ${paymentId} - User ${userId} (${plan})`);

    // TODO: Send confirmation email or Discord DM
    // await sendConfirmationEmail(email, plan, email);
  }
}

/**
 * Handle payment.failed event
 * Payment failed for some reason
 */
function handlePaymentFailed(payload) {
  const payment = payload.payment;
  const paymentId = payment.entity.id;
  const email = payment.entity.email;
  const reason = payment.entity.reason_code;
  const description = payment.entity.description;

  const notes = payment.entity.notes;
  const userId = notes?.userId || 'Unknown';

  console.error(`❌ Payment failed: ${paymentId}`);
  console.error(`   User: ${userId}`);
  console.error(`   Email: ${email}`);
  console.error(`   Reason: ${reason} - ${description}`);

  // TODO: Log failed payment for review
  // TODO: Send failure notification to user
  // await sendFailureEmail(email, reason);
}

/**
 * Handle refund.created event
 * Refund was issued
 */
function handleRefund(payload) {
  const refund = payload.refund;
  const refundId = refund.entity.id;
  const paymentId = refund.entity.payment_id;
  const amount = refund.entity.amount;
  const notes = refund.entity.notes;

  console.log(`↩️ Refund created: ${refundId}`);
  console.log(`   Original Payment: ${paymentId}`);
  console.log(`   Refund Amount: ₹${amount / 100}`);

  // TODO: Remove premium status if refund processed
  // If the payment was refunded, consider removing premium access
  // const userId = notes?.userId;
  // if (userId) {
  //   paymentUtils.removePremiumUser(userId);
  //   console.log(`🔄 Premium revoked for user ${userId}`);
  // }
}

module.exports = router;
