const { EmbedBuilder } = require("discord.js");
const growthUtils = require("../utils/growthUtils");
const messages = require("../utils/messages.js");
const config = require("../config");

function formatPassStatus(summary) {
    if (!summary?.referralPassExpiresAt) {
        return "No active weekly pass";
    }
    const expiry = new Date(summary.referralPassExpiresAt);
    if (Number.isNaN(expiry.getTime())) {
        return "Active (expiry unknown)";
    }
    if (summary.hasActiveReferralPass) {
        return `Active until ${expiry.toLocaleString()}`;
    }
    return `Expired on ${expiry.toLocaleString()}`;
}

module.exports = {
    name: "refer",
    aliases: ["referral", "ref"],
    description: "Referral rewards: share code and claim invites",
    usage: "frefer [code|stats|claim <code>]",
    cooldownMs: 2000,
    execute: async (message, args, client) => {
        const action = String(args[0] || "code").toLowerCase();
        const userId = message.author.id;

        if (action === "claim") {
            const code = String(args[1] || "").trim().toUpperCase();
            if (!code) {
                return messages.error(message.channel, "Usage: `frefer claim <code>`");
            }

            const result = growthUtils.claimReferral(userId, code);
            if (!result.ok) {
                const reasonMap = {
                    CODE_REQUIRED: "Referral code is required.",
                    CODE_NOT_FOUND: "Referral code not found.",
                    SELF_REFERRAL_NOT_ALLOWED: "You cannot use your own code.",
                    ALREADY_CLAIMED: "You already claimed a referral code."
                };
                return messages.error(message.channel, reasonMap[result.reason] || "Failed to claim referral.");
            }

            const embed = new EmbedBuilder()
                .setColor("#00C853")
                .setTitle("Referral Claimed")
                .setDescription("Referral reward added for both users.")
                .addFields(
                    { name: "Inviter ID", value: result.ownerId, inline: true },
                    { name: "Your Tokens", value: String(result.claimantTokens), inline: true },
                    { name: "Reward", value: `+${result.rewardTokens} trial token`, inline: true },
                    {
                        name: "Weekly Referral Pass",
                        value: `+${result.referralPassDays} days (until ${new Date(result.claimantPassExpiresAt).toLocaleString()})`,
                        inline: false
                    }
                )
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        const summary = growthUtils.getUserGrowthSummary(userId);

        if (action === "stats") {
            const embed = new EmbedBuilder()
                .setColor("#2962FF")
                .setTitle("Referral Stats")
                .addFields(
                    { name: "Your Code", value: `\`${summary.referralCode}\``, inline: true },
                    { name: "Referral Count", value: String(summary.referralCount), inline: true },
                    { name: "Trial Tokens", value: String(summary.trialTokens), inline: true },
                    { name: "Referred By", value: summary.referredBy || "None", inline: false },
                    { name: "Weekly Referral Pass", value: formatPassStatus(summary), inline: false },
                    { name: "Join Server", value: config.supportURL || "Support link not configured", inline: false }
                )
                .setTimestamp();
            return message.channel.send({ embeds: [embed] });
        }

        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=1466777461680373820&permissions=281474980236544&scope=bot%20applications.commands`;
        const embed = new EmbedBuilder()
            .setColor("#7C4DFF")
            .setTitle("Your Referral Code")
            .setDescription("Share your code. When a user claims it, both get trial tokens.")
            .addFields(
                { name: "Code", value: `\`${summary.referralCode}\``, inline: true },
                { name: "Trial Tokens", value: String(summary.trialTokens), inline: true },
                { name: "How to Claim", value: "`frefer claim <code>`", inline: true },
                { name: "Weekly Referral Pass", value: formatPassStatus(summary), inline: false },
                { name: "Invite Bot", value: inviteUrl, inline: false },
                { name: "Join Server", value: config.supportURL || "Support link not configured", inline: false }
            )
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }
};
