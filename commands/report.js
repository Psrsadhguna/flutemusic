const { EmbedBuilder } = require("discord.js");
const axios = require("axios");
const config = require("../config.js");
const messages = require("../utils/messages.js");

function makeReportId() {
    return `RPT-${Date.now().toString(36).toUpperCase()}`;
}

module.exports = {
    name: "report",
    aliases: ["bugreport", "bug"],
    description: "Report a bug with optional error ID",
    usage: "freport [ERROR_ID] <details>",
    cooldownMs: 3000,
    execute: async (message, args, client) => {
        if (!args.length) {
            return messages.info(
                message.channel,
                "Bug Report",
                "Use `freport <details>` or `freport ERR-XXXX <details>`."
            );
        }

        const maybeErrorId = String(args[0] || "");
        const hasErrorId = /^ERR-[A-Z0-9]+$/i.test(maybeErrorId);
        const reportText = hasErrorId ? args.slice(1).join(" ").trim() : args.join(" ").trim();
        const errorId = hasErrorId ? maybeErrorId.toUpperCase() : "Not provided";

        if (!reportText) {
            return messages.error(message.channel, "Please add report details after the error ID.");
        }

        const reportId = makeReportId();

        const ack = new EmbedBuilder()
            .setColor("#FFC107")
            .setTitle("Report Submitted")
            .setDescription("Thanks. Our team received your issue report.")
            .addFields(
                { name: "Report ID", value: reportId, inline: true },
                { name: "Error ID", value: errorId, inline: true },
                { name: "Reporter", value: `${message.author.tag}`, inline: true },
                { name: "Details", value: reportText.slice(0, 1024), inline: false }
            )
            .setTimestamp();

        await message.channel.send({ embeds: [ack] });

        if (!config.feedbackWebhookUrl) {
            return;
        }

        const webhookEmbed = {
            color: 0xff7043,
            title: "New Bug Report",
            fields: [
                { name: "Report ID", value: reportId, inline: true },
                { name: "Error ID", value: errorId, inline: true },
                { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: false },
                { name: "Server", value: `${message.guild?.name || "DM"} (${message.guild?.id || "N/A"})`, inline: false },
                { name: "Details", value: reportText.slice(0, 1024), inline: false }
            ],
            timestamp: new Date().toISOString()
        };

        await axios.post(config.feedbackWebhookUrl, {
            username: "Flute Bug Reporter",
            embeds: [webhookEmbed]
        }).catch((error) => {
            console.error("Bug report webhook failed:", error.message);
        });
    }
};
