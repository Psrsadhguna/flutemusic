const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");

const DEFAULT_UPTIME_CHANNEL_ID = "1477658925095587992";
const DEFAULT_UPDATE_INTERVAL_MS = 60 * 1000;
const STATE_FILE = path.join(__dirname, "../database/uptime_message.json");

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getUptimeChannelId() {
  const configured = String(process.env.UPTIME_CHANNEL_ID || "").trim();
  return configured || DEFAULT_UPTIME_CHANNEL_ID;
}

function getUpdateIntervalMs() {
  return parsePositiveInt(process.env.UPTIME_UPDATE_INTERVAL_MS, DEFAULT_UPDATE_INTERVAL_MS);
}

function ensureStateDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return { channelId: "", messageId: "" };
    }
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      channelId: String(parsed?.channelId || "").trim(),
      messageId: String(parsed?.messageId || "").trim()
    };
  } catch (error) {
    console.error("Uptime reporter: failed to load state:", error.message);
    return { channelId: "", messageId: "" };
  }
}

function saveState(state) {
  try {
    ensureStateDir();
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          channelId: String(state?.channelId || "").trim(),
          messageId: String(state?.messageId || "").trim(),
          updatedAt: new Date().toISOString()
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.error("Uptime reporter: failed to save state:", error.message);
  }
}

function clearState() {
  saveState({ channelId: "", messageId: "" });
}

function formatUptime(ms) {
  const totalMs = Number(ms) || 0;
  const days = Math.floor(totalMs / 86400000);
  const hours = Math.floor((totalMs % 86400000) / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function buildEmbed(client, bootedAtIso, channelId) {
  const bootTime = new Date(bootedAtIso);
  const bootText = Number.isNaN(bootTime.getTime()) ? "Unknown" : bootTime.toLocaleString();

  return new EmbedBuilder()
    .setColor("#00ACC1")
    .setTitle("Flute Bot Uptime Monitor")
    .setDescription("This message is persistent. On restart, the bot edits this same embed.")
    .addFields(
      { name: "Uptime", value: formatUptime(client.uptime), inline: true },
      { name: "Latency", value: `${Math.round(client.ws.ping)}ms`, inline: true },
      { name: "Restarted At", value: bootText, inline: false },
      { name: "Channel ID", value: channelId, inline: false }
    )
    .setFooter({ text: "Uptime tracker message (single embed mode)" })
    .setTimestamp();
}

async function fetchTrackedMessage(client, channelId) {
  const state = loadState();
  if (!state.messageId || state.channelId !== channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return null;

  return channel.messages.fetch(state.messageId).catch(() => null);
}

async function findExistingUptimeMessage(client, channelId) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return null;

  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recent) return null;

  return recent.find((message) => {
    if (message.author?.id !== client.user.id) return false;
    const firstEmbed = message.embeds?.[0];
    return firstEmbed?.title === "Flute Bot Uptime Monitor";
  }) || null;
}

async function ensureTrackedMessage(client, channelId, bootedAtIso) {
  let tracked = await fetchTrackedMessage(client, channelId);
  if (tracked) return tracked;

  tracked = await findExistingUptimeMessage(client, channelId);
  if (tracked) {
    saveState({ channelId, messageId: tracked.id });
    return tracked;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return null;

  const created = await channel.send({
    embeds: [buildEmbed(client, bootedAtIso, channelId)]
  }).catch(() => null);

  if (!created) return null;

  saveState({ channelId, messageId: created.id });
  return created;
}

function startUptimeReporter(client) {
  const channelId = getUptimeChannelId();
  if (!channelId) {
    console.warn("Uptime reporter skipped: no channel id configured");
    return null;
  }

  const updateIntervalMs = getUpdateIntervalMs();
  const bootedAtIso = new Date().toISOString();
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const tracked = await ensureTrackedMessage(client, channelId, bootedAtIso);
      if (!tracked) {
        console.warn(`Uptime reporter skipped: channel unavailable (${channelId})`);
        return;
      }

      await tracked.edit({
        embeds: [buildEmbed(client, bootedAtIso, channelId)]
      }).catch(async (error) => {
        const errorCode = String(error?.code || "");
        if (errorCode === "10008") {
          clearState();
        }
      });
    } catch (error) {
      console.error("Uptime reporter failed:", error.message);
    } finally {
      running = false;
    }
  };

  run();
  return setInterval(run, updateIntervalMs);
}

module.exports = { startUptimeReporter };
