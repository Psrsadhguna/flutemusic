const { EmbedBuilder } = require("discord.js");
const paymentUtils = require("../utils/paymentUtils");
const { getPlan } = require("../utils/premiumPlans");
const config = require("../config");

function formatPlanName(planKey) {
  if (planKey === "trial") return "Trial";
  return getPlan(planKey).label;
}

function formatDate(iso) {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
}

module.exports = {
  name: "premium",
  description: "Check premium status and available plans",

  execute(message) {
    const userId = message.author.id;
    const hasPremium = paymentUtils.isPremium(userId);
    const premiumUser = paymentUtils.getPremiumUser(userId);

    const webURL = process.env.WEBSITE_URL || "https://rzp.io/rzp/y8GBu3mB";
    const weeklyPlan = getPlan("weekly");
    const monthlyPlan = getPlan("monthly");
    const lifetimePlan = getPlan("lifetime");

    const embed = new EmbedBuilder()
      .setTitle("Flute Music Premium")
      .setColor(hasPremium ? "#FFD700" : "#808080")
      .setThumbnail(message.author.displayAvatarURL())
      .setDescription(
        hasPremium
          ? "You have premium access."
          : "You do not have premium access right now."
      );

    if (hasPremium && premiumUser) {
      embed.addFields(
        {
          name: "Plan Type",
          value: formatPlanName(premiumUser.plan || "monthly"),
          inline: true
        },
        {
          name: "Expiration",
          value: formatDate(premiumUser.expiresAt),
          inline: true
        },
        {
          name: "Purchased",
          value: formatDate(premiumUser.purchasedAt),
          inline: true
        },
        {
          name: "Unlocked Features",
          value:
            "- Advanced filter/effects pack\n" +
            "- 24/7 voice stay mode\n" +
            "- Up to 20 saved playlists\n" +
            "- Priority support"
        }
      );
    } else {
      embed.addFields(
        {
          name: `${weeklyPlan.label} - INR ${weeklyPlan.amount / 100}`,
          value: `${weeklyPlan.description}`
        },
        {
          name: `${monthlyPlan.label} - INR ${monthlyPlan.amount / 100}`,
          value: `${monthlyPlan.description}`
        },
        {
          name: `${lifetimePlan.label} - INR ${lifetimePlan.amount / 100}`,
          value: `${lifetimePlan.description}`
        },
        {
          name: "Free Trial",
          value: "Use `ftrial start` (one-time) or `ftrial use` (with tokens)."
        },
        {
          name: "Purchase Link",
          value: `[Open premium page](${webURL})`
        }
      );
    }

    embed.addFields({
      name: "Join Server",
      value: config.supportURL || "Support link not configured"
    });

    message.reply({ embeds: [embed] });
  }
};
