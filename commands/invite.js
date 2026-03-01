const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
    name: "invite",
    description: "Get bot invite link",
    usage: "finvite",
    cooldownMs: 1500,
    execute: async (message, args, client) => {
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=36724736`;

        const embed = new EmbedBuilder()
            .setColor("#0061ff")
            .setTitle("Invite Flute Music Bot")
            .setDescription("Invite the bot to your server and join the growth campaign.")
            .addFields(
                {
                    name: "Features",
                    value: "Music playback, filters, effects, queue controls",
                    inline: false
                },
                {
                    name: "Growth Campaign",
                    value: "Use `fcampaign join` and `frefer` to earn trial tokens.",
                    inline: false
                },
                {
                    name: "Permissions",
                    value: "Send Messages, Embed Links, Connect, Speak",
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
