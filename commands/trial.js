const { EmbedBuilder } = require("discord.js");
const growthUtils = require("../utils/growthUtils");
const paymentUtils = require("../utils/paymentUtils");
const messages = require("../utils/messages.js");

function formatExpiry(iso) {
    if (!iso) return "Never";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
}

module.exports = {
    name: "trial",
    aliases: ["freetrial"],
    description: "Use trial tokens to activate a 3-day premium trial",
    usage: "ftrial [status|use]",
    cooldownMs: 2000,
    execute: async (message, args) => {
        const userId = message.author.id;
        const summary = growthUtils.getUserGrowthSummary(userId);
        const activePremium = paymentUtils.isPremium(userId);
        const premiumUser = paymentUtils.getPremiumUser(userId);

        const action = String(args[0] || "status").toLowerCase();

        if (action !== "use") {
            const embed = new EmbedBuilder()
                .setColor("#00ACC1")
                .setTitle("Trial Tokens")
                .addFields(
                    { name: "Available Tokens", value: String(summary.trialTokens), inline: true },
                    { name: "Premium Active", value: activePremium ? "Yes" : "No", inline: true },
                    { name: "Current Plan", value: premiumUser?.plan || "None", inline: true },
                    { name: "How to Use", value: "`ftrial use`", inline: false }
                )
                .setTimestamp();
            return message.channel.send({ embeds: [embed] });
        }

        if (premiumUser?.plan === "lifetime" && activePremium) {
            return messages.error(message.channel, "You already have lifetime premium.");
        }

        if (summary.trialTokens <= 0) {
            return messages.error(message.channel, "No trial tokens available. Use `frefer` or `fcampaign`.");
        }

        const granted = paymentUtils.grantTrialPremium(userId, 3, "trial_token");
        const consumed = growthUtils.consumeTrialToken(userId);

        if (!consumed.ok) {
            return messages.error(message.channel, "Could not consume trial token. Please try again.");
        }

        const embed = new EmbedBuilder()
            .setColor("#43A047")
            .setTitle("3-Day Trial Activated")
            .setDescription("Premium trial is active now.")
            .addFields(
                { name: "Plan", value: granted.plan || "trial", inline: true },
                { name: "Expires", value: formatExpiry(granted.expiresAt), inline: true },
                { name: "Remaining Tokens", value: String(consumed.remainingTokens), inline: true }
            )
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }
};
