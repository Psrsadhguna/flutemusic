const axios = require('axios');
const { EmbedBuilder } = require('discord.js');

/**
 * Send a webhook notification for premium activity
 * @param {string} webhookUrl - Discord webhook URL
 * @param {object} data - Premium event data
 */
async function notifyPremiumActivity(webhookUrl, data) {
  if (!webhookUrl) {
    console.warn('⚠️ Premium webhook URL not configured');
    return false;
  }

  try {
    const embed = createEmbed(data);
    
    await axios.post(webhookUrl, {
      username: '💎 Premium Activity Monitor',
      avatar_url: 'https://cdn.discordapp.com/emojis/1234567890.png',
      embeds: [embed]
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    return true;
  } catch (error) {
    console.error('❌ Webhook notification failed:', error.message);
    return false;
  }
}

/**
 * Create premium activity embed
 */
function createEmbed(data) {
  const { type, userId, email, plan, amount, status } = data;

  const embeds = {
    purchase: {
      color: 0xFFD700,
      title: '💳 New Premium Purchase',
      fields: [
        { name: 'User ID', value: userId, inline: true },
        { name: 'Plan', value: plan === 'lifetime' ? '🌟 Lifetime' : '📅 Monthly', inline: true },
        { name: 'Amount', value: `₹${(amount / 100).toFixed(2)}`, inline: true },
        { name: 'Email', value: email || 'N/A', inline: false },
        { name: 'Status', value: '✅ Active', inline: true }
      ],
      footer: { text: 'Razorpay Premium System' },
      timestamp: new Date()
    },

    expiry: {
      color: 0xFF6B6B,
      title: '⏰ Premium Expired',
      fields: [
        { name: 'User ID', value: userId, inline: true },
        { name: 'Plan', value: plan === 'lifetime' ? '🌟 Lifetime' : '📅 Monthly', inline: true },
        { name: 'Status', value: '❌ Expired', inline: true },
        { name: 'Email', value: email || 'N/A', inline: false }
      ],
      footer: { text: 'Premium access revoked' },
      timestamp: new Date()
    },

    check: {
      color: 0x6366CF,
      title: '🔍 Premium Status Check',
      fields: [
        { name: 'User ID', value: userId, inline: true },
        { name: 'Status', value: status ? '✅ Premium' : '❌ Free User', inline: true },
        { name: 'Plan', value: plan || 'None', inline: true },
        { name: 'Email', value: email || 'N/A', inline: false }
      ],
      footer: { text: 'Premium Status Monitor' },
      timestamp: new Date()
    },

    stats: {
      color: 0x51CF66,
      title: '📊 Premium Statistics',
      fields: Object.entries(data).map(([key, value]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        value: String(value),
        inline: true
      })),
      footer: { text: 'Razorpay Premium System' },
      timestamp: new Date()
    }
  };

  return embeds[type] || embeds.check;
}

/**
 * Notify about new premium purchase
 */
async function notifyNewPremium(webhookUrl, userId, email, plan, amount) {
  return notifyPremiumActivity(webhookUrl, {
    type: 'purchase',
    userId,
    email,
    plan,
    amount,
    timestamp: new Date()
  });
}

/**
 * Notify about premium expiry
 */
async function notifyPremiumExpiry(webhookUrl, userId, email, plan) {
  return notifyPremiumActivity(webhookUrl, {
    type: 'expiry',
    userId,
    email,
    plan
  });
}

/**
 * Notify about premium status check
 */
async function notifyPremiumCheck(webhookUrl, userId, email, isPremium, plan) {
  return notifyPremiumActivity(webhookUrl, {
    type: 'check',
    userId,
    email,
    status: isPremium,
    plan: plan || 'None'
  });
}

/**
 * Send premium statistics
 */
async function notifyPremiumStats(webhookUrl, stats) {
  return notifyPremiumActivity(webhookUrl, {
    type: 'stats',
    ...stats
  });
}

module.exports = {
  notifyPremiumActivity,
  notifyNewPremium,
  notifyPremiumExpiry,
  notifyPremiumCheck,
  notifyPremiumStats
};
