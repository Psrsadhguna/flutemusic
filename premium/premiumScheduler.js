const paymentUtils = require("../utils/paymentUtils");
const { syncPremiumRoleForUser } = require("./roleSystem");
const config = require("../config");

const HOUR_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_REMINDER_HOURS = [24, 1];

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function getReminderHours() {
  const raw = String(process.env.TRIAL_REMINDER_HOURS || "").trim();
  if (!raw) {
    return DEFAULT_REMINDER_HOURS.slice();
  }

  const parsed = raw
    .split(",")
    .map((chunk) => parsePositiveInt(chunk))
    .filter((value) => Number.isFinite(value));

  if (!parsed.length) {
    return DEFAULT_REMINDER_HOURS.slice();
  }

  const uniq = Array.from(new Set(parsed));
  uniq.sort((left, right) => right - left);
  return uniq;
}

function formatExpiry(iso) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) {
    return "soon";
  }
  return when.toLocaleString();
}

function buildJoinServerLine() {
  const supportUrl = String(config.supportURL || process.env.SUPPORT_SERVER_URL || "").trim();
  return supportUrl ? `\nJoin support server: ${supportUrl}` : "";
}

async function sendDirectMessage(client, userId, content) {
  try {
    const user = await client.users.fetch(userId);
    if (!user) return false;
    await user.send({ content });
    return true;
  } catch {
    return false;
  }
}

async function processActiveTrialReminders(client, reminderHours) {
  const trialUsers = paymentUtils.listActiveTrialUsers();
  if (!trialUsers.length) {
    return;
  }

  for (const trialUser of trialUsers) {
    const remindersSent = trialUser?.trial?.remindersSent || {};

    for (const hours of reminderHours) {
      const thresholdMs = hours * HOUR_MS;
      if (trialUser.msRemaining > thresholdMs) {
        continue;
      }

      const reminderKey = `before_${hours}h_${trialUser.expiresAt}`;
      if (remindersSent[reminderKey]) {
        continue;
      }

      const sent = await sendDirectMessage(
        client,
        trialUser.userId,
        `Your Flute Music premium trial expires in about ${hours} hour(s) (${formatExpiry(trialUser.expiresAt)}).\nUse \`ftrial use\` to extend with token or \`fpremium\` to upgrade.`
      );

      paymentUtils.markTrialReminderSent(trialUser.userId, reminderKey);

      if (sent) {
        console.log(`Sent trial reminder (${hours}h) to user ${trialUser.userId}`);
      }
    }
  }
}

async function processExpiredPremiumNotices(client, expiredUsers) {
  for (const expired of expiredUsers) {
    if (!expired) {
      continue;
    }

    const notifiedFor = expired?.trial?.expiryNotifiedFor || null;
    if (notifiedFor && notifiedFor === expired.expiresAt) {
      continue;
    }

    const joinLine = buildJoinServerLine();
    const message = expired.plan === "trial"
      ? `Your Flute Music premium trial has expired (${formatExpiry(expired.expiresAt)}).\nYou can still use free core music commands. Use \`ftrial use\` or \`fpremium\` when ready.${joinLine}`
      : `Your Flute Music premium plan (${expired.plan || "premium"}) expired on ${formatExpiry(expired.expiresAt)}.\nRenew with \`fpremium\` to restore premium features.${joinLine}`;

    const sent = await sendDirectMessage(client, expired.userId, message);

    paymentUtils.markTrialExpiryNotified(expired.userId, expired.expiresAt);

    if (sent) {
      console.log(`Sent premium expiry notice to user ${expired.userId}`);
    }
  }
}

function startPremiumExpiryChecker(client) {
  const reminderHours = getReminderHours();

  setInterval(async () => {
    try {
      await processActiveTrialReminders(client, reminderHours);

      const result = paymentUtils.cleanupExpiredPremiums();
      const expiredUserIds = Array.isArray(result?.expiredUserIds)
        ? result.expiredUserIds
        : [];
      const expiredUsers = Array.isArray(result?.expiredUsers)
        ? result.expiredUsers
        : [];

      for (const userId of expiredUserIds) {
        await syncPremiumRoleForUser(client, userId, false);
      }

      if (expiredUsers.length > 0) {
        await processExpiredPremiumNotices(client, expiredUsers);
      }

      if (expiredUserIds.length > 0) {
        console.log(`Premium expired for ${expiredUserIds.length} user(s)`);
      }
    } catch (error) {
      console.error("Premium expiry checker failed:", error.message);
    }
  }, CHECK_INTERVAL_MS);
}

module.exports = { startPremiumExpiryChecker };
