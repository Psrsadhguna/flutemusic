const { EmbedBuilder } = require("discord.js");
const paymentUtils = require('./paymentUtils');

async function requirePremium(message) {
    // Check if user is premium using new Razorpay system
    const isPremiumUser = paymentUtils.isPremium(message.author.id);

    if (isPremiumUser) return true;

    const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle("💎 Premium Feature")
        .setDescription(
            "This command is **Premium Only**.\n\n" +
            "Unlock all 50+ filters and effects with our **₹99 Premium Plan**!\n\n" +
            "Use `/premium buy` or visit our website to purchase."
        )
        .setFooter({ text: "Premium access grants unlimited filter usage" });

    await message.reply({ embeds: [embed] });

    return false;
}

module.exports = { requirePremium };