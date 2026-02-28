const { EmbedBuilder } = require("discord.js");
const growthUtils = require("../utils/growthUtils");
const paymentUtils = require("../utils/paymentUtils");
const messages = require("../utils/messages.js");

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function getStarterTrialDays() {
    return parsePositiveInt(process.env.TRIAL_STARTER_DAYS, 7);
}

function getTokenTrialDays() {
    return parsePositiveInt(process.env.TRIAL_TOKEN_DAYS, 3);
}

function formatExpiry(iso) {
    if (!iso) return "Never";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
}

module.exports = {
    name: "trial",
    aliases: ["freetrial"],
    description: "Starter trial + token-based trial extensions",
    usage: "ftrial [status|start|use]",
    cooldownMs: 2000,
    execute: async (message, args) => {
        const userId = message.author.id;
        const summary = growthUtils.getUserGrowthSummary(userId);
        const activePremium = paymentUtils.isPremium(userId);
        const premiumUser = paymentUtils.getPremiumUser(userId);
        const trialMeta = paymentUtils.getTrialMetadata(userId);
        const starterTrialDays = getStarterTrialDays();
        const tokenTrialDays = getTokenTrialDays();

        const action = String(args[0] || "status").toLowerCase();

        if (action === "status") {
            const starterEligibility = paymentUtils.canUseStarterTrial(userId);
            let starterStatus = `${starterTrialDays}-day trial available`;

            if (!starterEligibility.ok) {
                const statusByReason = {
                    STARTER_ALREADY_USED: "Starter trial already used",
                    PREMIUM_ALREADY_ACTIVE: "Premium already active",
                    LIFETIME_ALREADY_ACTIVE: "Lifetime premium active"
                };
                starterStatus = statusByReason[starterEligibility.reason] || "Not available right now";
            }

            const embed = new EmbedBuilder()
                .setColor("#00ACC1")
                .setTitle("Premium Trial Center")
                .addFields(
                    { name: "Available Tokens", value: String(summary.trialTokens), inline: true },
                    { name: "Premium Active", value: activePremium ? "Yes" : "No", inline: true },
                    { name: "Current Plan", value: premiumUser?.plan || "None", inline: true },
                    { name: "Starter Trial", value: starterStatus, inline: false },
                    { name: "Commands", value: "`ftrial start` | `ftrial use`", inline: false },
                    {
                        name: "Last Trial",
                        value: trialMeta.lastGrantedAt
                            ? `${formatExpiry(trialMeta.lastGrantedAt)} (${trialMeta.lastReason || "trial"})`
                            : "No trial usage yet",
                        inline: false
                    }
                )
                .setTimestamp();
            return message.channel.send({ embeds: [embed] });
        }

        if (action === "start") {
            const eligibility = paymentUtils.canUseStarterTrial(userId);
            if (!eligibility.ok) {
                const reasonMap = {
                    STARTER_ALREADY_USED: "Starter trial is one-time only, and you already used it.",
                    PREMIUM_ALREADY_ACTIVE: "You already have an active premium plan.",
                    LIFETIME_ALREADY_ACTIVE: "You already have lifetime premium."
                };
                return messages.error(message.channel, reasonMap[eligibility.reason] || "Starter trial is not available right now.");
            }

            const granted = paymentUtils.grantTrialPremium(userId, starterTrialDays, "starter_trial");
            const embed = new EmbedBuilder()
                .setColor("#43A047")
                .setTitle(`${starterTrialDays}-Day Starter Trial Activated`)
                .setDescription("Premium trial is active now.")
                .addFields(
                    { name: "Plan", value: granted.plan || "trial", inline: true },
                    { name: "Expires", value: formatExpiry(granted.expiresAt), inline: true },
                    { name: "Reminder", value: "You will get expiry reminders in DM.", inline: false }
                )
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        if (action !== "use") {
            return messages.error(message.channel, "Usage: `ftrial [status|start|use]`");
        }

        if (premiumUser?.plan === "lifetime" && activePremium) {
            return messages.error(message.channel, "You already have lifetime premium.");
        }

        if (activePremium && premiumUser?.plan && premiumUser.plan !== "trial") {
            return messages.error(message.channel, "You already have an active paid premium plan.");
        }

        if (summary.trialTokens <= 0) {
            return messages.error(message.channel, "No trial tokens available. Use `frefer` or `fcampaign`.");
        }

        const consumed = growthUtils.consumeTrialToken(userId);
        if (!consumed.ok) {
            return messages.error(message.channel, "Could not consume trial token. Please try again.");
        }

        const granted = paymentUtils.grantTrialPremium(userId, tokenTrialDays, "trial_token");

        const embed = new EmbedBuilder()
            .setColor("#43A047")
            .setTitle(`${tokenTrialDays}-Day Trial Extension Activated`)
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
