const axios = require("axios");

function formatPlan(plan) {
  const normalized = String(plan || "").toLowerCase();
  if (normalized === "weekly") return "Weekly";
  if (normalized === "lifetime") return "Lifetime";
  if (normalized === "monthly") return "Monthly";
  return plan || "None";
}

async function notifyPremiumActivity(webhookUrl, data) {
  if (!webhookUrl) {
    console.warn("Premium webhook URL not configured");
    return false;
  }

  try {
    const embed = createEmbed(data);

    await axios.post(
      webhookUrl,
      {
        username: "Premium Activity Monitor",
        embeds: [embed]
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );

    return true;
  } catch (error) {
    console.error("Webhook notification failed:", error.message);
    return false;
  }
}

function createEmbed(data) {
  const { type, userId, email, plan, amount, status } = data;

  const embeds = {
    purchase: {
      color: 0xffd700,
      title: "New Premium Purchase",
      fields: [
        { name: "User ID", value: String(userId || "Unknown"), inline: true },
        { name: "Plan", value: formatPlan(plan), inline: true },
        { name: "Amount", value: `INR ${((amount || 0) / 100).toFixed(2)}`, inline: true },
        { name: "Email", value: email || "N/A", inline: false },
        { name: "Status", value: "Active", inline: true }
      ],
      footer: { text: "Razorpay Premium System" },
      timestamp: new Date()
    },

    expiry: {
      color: 0xff6b6b,
      title: "Premium Expired",
      fields: [
        { name: "User ID", value: String(userId || "Unknown"), inline: true },
        { name: "Plan", value: formatPlan(plan), inline: true },
        { name: "Status", value: "Expired", inline: true },
        { name: "Email", value: email || "N/A", inline: false }
      ],
      footer: { text: "Premium access revoked" },
      timestamp: new Date()
    },

    check: {
      color: 0x6366cf,
      title: "Premium Status Check",
      fields: [
        { name: "User ID", value: String(userId || "Unknown"), inline: true },
        { name: "Status", value: status ? "Premium" : "Free User", inline: true },
        { name: "Plan", value: formatPlan(plan), inline: true },
        { name: "Email", value: email || "N/A", inline: false }
      ],
      footer: { text: "Premium Status Monitor" },
      timestamp: new Date()
    },

    stats: {
      color: 0x51cf66,
      title: "Premium Statistics",
      fields: Object.entries(data)
        .filter(([key]) => key !== "type")
        .map(([key, value]) => ({
          name: key.charAt(0).toUpperCase() + key.slice(1),
          value: String(value),
          inline: true
        })),
      footer: { text: "Razorpay Premium System" },
      timestamp: new Date()
    }
  };

  return embeds[type] || embeds.check;
}

async function notifyNewPremium(webhookUrl, userId, email, plan, amount) {
  return notifyPremiumActivity(webhookUrl, {
    type: "purchase",
    userId,
    email,
    plan,
    amount,
    timestamp: new Date().toISOString()
  });
}

async function notifyPremiumExpiry(webhookUrl, userId, email, plan) {
  return notifyPremiumActivity(webhookUrl, {
    type: "expiry",
    userId,
    email,
    plan
  });
}

async function notifyPremiumCheck(webhookUrl, userId, email, isPremium, plan) {
  return notifyPremiumActivity(webhookUrl, {
    type: "check",
    userId,
    email,
    status: isPremium,
    plan: plan || "None"
  });
}

async function notifyPremiumStats(webhookUrl, stats) {
  return notifyPremiumActivity(webhookUrl, {
    type: "stats",
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
