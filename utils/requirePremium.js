const { EmbedBuilder } = require("discord.js");
const paymentUtils = require("./paymentUtils");
const { getPlan } = require("./premiumPlans");

async function requirePremium(message) {
  if (process.env.ENFORCE_PREMIUM !== "true") {
    return true;
  }

  const isPremiumUser = paymentUtils.isPremium(message.author.id);
  if (isPremiumUser) {
    return true;
  }

  const weeklyPlan = getPlan("weekly");
  const monthlyPlan = getPlan("monthly");

  const embed = new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle("Premium Feature")
    .setDescription(
      "This command is premium only.\n\n" +
      "Core playback commands are always free.\n" +
      `Plans: ${weeklyPlan.label} INR ${weeklyPlan.amount / 100}, ` +
      `${monthlyPlan.label} INR ${monthlyPlan.amount / 100}.\n\n` +
      "Use `f premium` or open the premium website to buy access."
    )
    .setFooter({ text: "Premium unlocks advanced filters, 24/7 mode, and extra save slots" });

  await message.reply({ embeds: [embed] });
  return false;
}

module.exports = { requirePremium };
