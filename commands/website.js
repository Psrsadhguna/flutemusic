const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

function getWebsiteUrl() {
    return String(process.env.WEBSITE_URL || "").trim() || "https://flutemusic-production.up.railway.app";
}

module.exports = {
    name: "website",
    aliases: ["web", "site", "dashboard"],
    description: "Get Flute Music website link",
    usage: "fwebsite",
    cooldownMs: 1500,
    execute: async (message, args, client) => {
        const websiteUrl = getWebsiteUrl();
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=36724736`;

        const embed = new EmbedBuilder()
            .setColor("#00a884")
            .setTitle("Flute Music Website")
            .setDescription("Open website for live server stats, premium pages, profile and dashboard.")
            .addFields(
                {
                    name: "Website",
                    value: websiteUrl,
                    inline: false
                },
                {
                    name: "Contains",
                    value: "Server name/logo, played, listening time, view statistics, premium and dashboard.",
                    inline: false
                }
            )
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .setFooter({
                text: "Flute music team",
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Open Website")
                .setStyle(ButtonStyle.Link)
                .setURL(websiteUrl),
            new ButtonBuilder()
                .setLabel("Invite Bot")
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl),
            new ButtonBuilder()
                .setLabel("Support Server")
                .setStyle(ButtonStyle.Link)
                .setURL("https://discord.gg/v7StyEvCCC")
        );

        return message.channel.send({ embeds: [embed], components: [row] });
    }
};
