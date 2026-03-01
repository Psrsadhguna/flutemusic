const { EmbedBuilder } = require("discord.js");
const config = require("../config");
const paymentUtils = require("./paymentUtils");
const growthUtils = require("./growthUtils");

function formatDateTime(iso) {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function getSupportServerUrl() {
  const configured = String(config.supportURL || "").trim();
  const fallback = String(process.env.SUPPORT_SERVER_URL || "").trim();
  return configured || fallback || "";
}

async function notifyPassExpiryIfNeeded(message, passStatus) {
  if (!passStatus || passStatus.hasAccess) return;
  if (!passStatus.expiresAt) return;
  if (passStatus.expiryNotifiedFor === passStatus.expiresAt) return;

  const supportUrl = getSupportServerUrl();
  const dmLines = [
    `Your Flute Music weekly referral pass expired on ${formatDateTime(passStatus.expiresAt)}.`,
    "Use `frefer` to unlock again, or use `fpremium` for full premium access."
  ];

  if (supportUrl) {
    dmLines.push(`Join server: ${supportUrl}`);
  }

  await message.author.send({ content: dmLines.join("\n") }).catch(() => {});
  growthUtils.markReferralPassExpiryNotified(message.author.id, passStatus.expiresAt);
}

async function requireReferralAccess(message, options = {}) {
  const featureName = String(options.feature || "This feature").trim();

  if (paymentUtils.isPremium(message.author.id)) {
    return true;
  }

  const passStatus = growthUtils.getReferralPassStatus(message.author.id);
  if (passStatus.hasAccess) {
    return true;
  }

  await notifyPassExpiryIfNeeded(message, passStatus);

  const supportUrl = getSupportServerUrl();
  const passText = passStatus.expiresAt
    ? `Expired on ${formatDateTime(passStatus.expiresAt)}`
    : "No active weekly pass yet";

  const embed = new EmbedBuilder()
    .setColor("#FFB300")
    .setTitle(`${featureName} Locked`)
    .setDescription(`${featureName} is available only for referral-pass users or premium users.`)
    .addFields(
      { name: "Referral Pass", value: passText, inline: false },
      { name: "Unlock", value: "Use `frefer`, then ask a friend to run `frefer claim <your-code>`.", inline: false },
      { name: "Join Server", value: supportUrl || "Support server link is not configured.", inline: false }
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
  return false;
}

module.exports = { requireReferralAccess };
