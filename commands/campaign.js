const { EmbedBuilder } = require("discord.js");
const growthUtils = require("../utils/growthUtils");

module.exports = {
    name: "campaign",
    aliases: ["promo", "growth"],
    description: "Invite campaign: join once and earn a trial token",
    usage: "fcampaign [join|status]",
    cooldownMs: 2000,
    execute: async (message, args, client) => {
        const action = String(args[0] || "status").toLowerCase();
        const userId = message.author.id;

        if (action === "join") {
            const result = growthUtils.grantCampaignTrialToken(userId);
            const code = growthUtils.getReferralCode(userId);
            const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=36724736`;

            const embed = new EmbedBuilder()
                .setColor(result.granted ? "#00C853" : "#FFB300")
                .setTitle("Invite Campaign")
                .setDescription(
                    result.granted
                        ? "Campaign joined. You received 1 trial token."
                        : "You already joined this campaign."
                )
                .addFields(
                    { name: "Your Referral Code", value: `\`${code}\``, inline: true },
                    { name: "Trial Tokens", value: String(result.trialTokens), inline: true },
                    { name: "Invite Bot", value: inviteUrl, inline: false },
                    { name: "Next Step", value: "Ask friends to use `frefer claim <your-code>`", inline: false }
                )
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        const summary = growthUtils.getUserGrowthSummary(userId);
        const embed = new EmbedBuilder()
            .setColor("#2962FF")
            .setTitle("Invite Campaign Status")
            .addFields(
                { name: "Joined", value: summary.campaignJoinedAt ? "Yes" : "No", inline: true },
                { name: "Trial Tokens", value: String(summary.trialTokens), inline: true },
                { name: "Referral Code", value: `\`${summary.referralCode}\``, inline: true },
                { name: "Join Command", value: "`fcampaign join`", inline: false }
            )
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }
};
