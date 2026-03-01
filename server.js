const express = require("express");
const path = require("path");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

const paymentUtils = require("./utils/paymentUtils");
const webhookNotifier = require("./utils/webhookNotifier");
const { listPlans, normalizePlan, isTestAmountEnabled } = require("./utils/premiumPlans");
const webhookRoutes = require("./server/webhook");

const app = express();
const port = process.env.PORT || 4000;
const premiumPlans = listPlans();
const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_OAUTH_SCOPE = String(process.env.DISCORD_OAUTH_SCOPE || "identify").trim() || "identify";
const DISCORD_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_COOKIE_NAME = "flute_auth_sid";
const AUTH_REDIRECT_FALLBACK = "premium-dashboard.html";
const oauthStateStore = new Map();
const authSessionStore = new Map();

let razorpayClient = null;

function getRazorpayClient() {
  if (razorpayClient) return razorpayClient;

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("RAZORPAY_NOT_CONFIGURED");
  }

  razorpayClient = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });

  return razorpayClient;
}

function timingSafeHexEqual(left, right) {
  if (!left || !right) return false;

  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isLikelyDiscordId(userId) {
  return /^[0-9]{15,22}$/.test(String(userId || "").trim());
}

const liveStatsSnapshotPath = path.join(__dirname, "website", "live-server-stats.json");
const LIVE_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 1000;

function readLiveServerSnapshot() {
  if (!fs.existsSync(liveStatsSnapshotPath)) {
    throw new Error("LIVE_STATS_MISSING");
  }

  const payload = JSON.parse(fs.readFileSync(liveStatsSnapshotPath, "utf8"));
  const isValid =
    payload &&
    payload.success === true &&
    Array.isArray(payload.servers) &&
    payload.platform &&
    typeof payload.platform === "object";

  if (!isValid) {
    throw new Error("LIVE_STATS_INVALID");
  }

  const updatedAtMs = Date.parse(payload.updatedAt || "");
  if (!Number.isFinite(updatedAtMs)) {
    throw new Error("LIVE_STATS_INVALID");
  }

  const ageMs = Date.now() - updatedAtMs;
  return {
    ...payload,
    stale: ageMs > LIVE_SNAPSHOT_MAX_AGE_MS,
    staleAgeMs: Math.max(0, ageMs)
  };
}

function getDiscordOAuthConfig() {
  const clientId = String(process.env.DISCORD_OAUTH_CLIENT_ID || process.env.DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DISCORD_OAUTH_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET || "").trim();
  const explicitRedirect = String(process.env.DISCORD_OAUTH_REDIRECT_URI || "").trim();
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const redirectUri = explicitRedirect || (publicBaseUrl ? `${publicBaseUrl}/auth/discord/callback` : "");

  return {
    clientId,
    clientSecret,
    redirectUri,
    scope: DISCORD_OAUTH_SCOPE
  };
}

function isDiscordOAuthReady(oauthConfig = getDiscordOAuthConfig()) {
  return Boolean(
    oauthConfig.clientId &&
    oauthConfig.clientSecret &&
    oauthConfig.redirectUri
  );
}

function parseCookieHeader(headerValue) {
  const cookies = {};
  const raw = String(headerValue || "");
  if (!raw) return cookies;

  const pairs = raw.split(";");
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function getAuthSessionIdFromRequest(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie);
  return String(cookies[AUTH_COOKIE_NAME] || "").trim();
}

function parseBoolean(value, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function shouldUseSecureAuthCookie(req) {
  if (parseBoolean(process.env.AUTH_COOKIE_SECURE, false)) {
    return true;
  }

  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
  return Boolean(req?.secure || forwardedProto.includes("https"));
}

function setAuthSessionCookie(res, sessionId, req) {
  res.cookie(AUTH_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureAuthCookie(req),
    maxAge: AUTH_SESSION_TTL_MS,
    path: "/"
  });
}

function clearAuthSessionCookie(res, req) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureAuthCookie(req),
    path: "/"
  });
}

function sanitizeRedirectPath(rawPath, fallbackPath = AUTH_REDIRECT_FALLBACK) {
  const candidate = String(rawPath || "").trim();
  if (!candidate) return fallbackPath;
  if (candidate.startsWith("http://") || candidate.startsWith("https://") || candidate.startsWith("//")) {
    return fallbackPath;
  }

  const normalized = candidate.startsWith("/") ? candidate.slice(1) : candidate;
  if (!normalized || normalized.includes("..")) {
    return fallbackPath;
  }
  return normalized;
}

function buildLoginRedirectUrl(params = {}) {
  const query = new URLSearchParams(params);
  const suffix = query.toString();
  return suffix ? `login.html?${suffix}` : "login.html";
}

function pruneExpiredAuthState() {
  const nowMs = Date.now();

  for (const [state, entry] of oauthStateStore.entries()) {
    if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= nowMs) {
      oauthStateStore.delete(state);
    }
  }

  for (const [sessionId, entry] of authSessionStore.entries()) {
    if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= nowMs) {
      authSessionStore.delete(sessionId);
    }
  }
}

setInterval(pruneExpiredAuthState, 5 * 60 * 1000);

function createAuthSession(user) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  authSessionStore.set(sessionId, {
    user,
    expiresAt: Date.now() + AUTH_SESSION_TTL_MS
  });
  return sessionId;
}

function getAuthSessionEntry(sessionId, { refreshExpiry = true } = {}) {
  if (!sessionId) return null;
  const entry = authSessionStore.get(sessionId);
  if (!entry) return null;

  if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) {
    authSessionStore.delete(sessionId);
    return null;
  }

  if (refreshExpiry) {
    entry.expiresAt = Date.now() + AUTH_SESSION_TTL_MS;
    authSessionStore.set(sessionId, entry);
  }

  return entry;
}

function buildDiscordAvatarUrl(discordUser) {
  const discordId = String(discordUser?.id || "").trim();
  const avatarHash = String(discordUser?.avatar || "").trim();

  if (discordId && avatarHash) {
    const extension = avatarHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${extension}?size=256`;
  }

  let fallbackIndex = 0;
  try {
    fallbackIndex = Number(BigInt(discordId || "0") % 6n);
  } catch {
    fallbackIndex = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
}

function getSessionPlanForUser(discordId) {
  if (!discordId) return "free";
  if (!paymentUtils.isPremium(discordId)) return "free";

  const premiumUser = paymentUtils.getPremiumUser(discordId);
  const plan = String(premiumUser?.plan || "").trim().toLowerCase();
  return plan || "free";
}

function buildWebsiteSessionUser(discordUser) {
  const discordId = String(discordUser?.id || "").trim();
  const usernameRaw = String(discordUser?.username || "").trim();
  const discriminator = String(discordUser?.discriminator || "").trim();
  const displayName = String(discordUser?.global_name || usernameRaw || "Discord User").trim();
  const discordUsername = discriminator && discriminator !== "0"
    ? `${usernameRaw}#${discriminator}`
    : (usernameRaw || displayName);

  return {
    username: displayName || "Discord User",
    discordUsername,
    discordId,
    avatar: buildDiscordAvatarUrl(discordUser),
    plan: getSessionPlanForUser(discordId),
    joinedAt: new Date().toISOString()
  };
}

app.use(
  "/webhook",
  express.raw({ type: "application/json" }),
  webhookRoutes
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/auth/config", (req, res) => {
  try {
    return res.json({
      success: true,
      configured: isDiscordOAuthReady()
    });
  } catch {
    return res.json({ success: true, configured: false });
  }
});

app.get("/auth/discord", (req, res) => {
  try {
    const oauthConfig = getDiscordOAuthConfig();
    if (!isDiscordOAuthReady(oauthConfig)) {
      return res.redirect(buildLoginRedirectUrl({ auth: "failed", reason: "oauth_not_configured" }));
    }

    pruneExpiredAuthState();
    const state = crypto.randomBytes(20).toString("hex");
    const redirectPath = sanitizeRedirectPath(req.query.redirect, AUTH_REDIRECT_FALLBACK);
    oauthStateStore.set(state, {
      expiresAt: Date.now() + DISCORD_OAUTH_STATE_TTL_MS,
      redirectPath
    });

    const params = new URLSearchParams({
      client_id: oauthConfig.clientId,
      redirect_uri: oauthConfig.redirectUri,
      response_type: "code",
      scope: oauthConfig.scope,
      state
    });

    return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  } catch (error) {
    console.error("Discord OAuth start failed:", error.message);
    return res.redirect(buildLoginRedirectUrl({ auth: "failed", reason: "oauth_start_failed" }));
  }
});

app.get("/auth/discord/callback", async (req, res) => {
  try {
    const oauthConfig = getDiscordOAuthConfig();
    if (!isDiscordOAuthReady(oauthConfig)) {
      return res.redirect(buildLoginRedirectUrl({ auth: "failed", reason: "oauth_not_configured" }));
    }

    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();
    if (!code || !state) {
      return res.redirect(buildLoginRedirectUrl({ auth: "failed", reason: "missing_code_or_state" }));
    }

    pruneExpiredAuthState();
    const stateEntry = oauthStateStore.get(state) || null;
    oauthStateStore.delete(state);
    if (!stateEntry || !Number.isFinite(stateEntry.expiresAt) || stateEntry.expiresAt <= Date.now()) {
      return res.redirect(buildLoginRedirectUrl({ auth: "failed", reason: "invalid_or_expired_state" }));
    }

    const tokenPayload = new URLSearchParams({
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: oauthConfig.redirectUri
    });

    const tokenResponse = await axios.post(
      `${DISCORD_API_BASE}/oauth2/token`,
      tokenPayload.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = String(tokenResponse?.data?.access_token || "").trim();
    const tokenType = String(tokenResponse?.data?.token_type || "Bearer").trim();
    if (!accessToken) {
      throw new Error("DISCORD_ACCESS_TOKEN_MISSING");
    }

    const userResponse = await axios.get(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        Authorization: `${tokenType} ${accessToken}`
      }
    });

    const sessionUser = buildWebsiteSessionUser(userResponse?.data || {});
    if (!sessionUser.discordId) {
      throw new Error("DISCORD_USER_ID_MISSING");
    }

    const sessionId = createAuthSession(sessionUser);
    setAuthSessionCookie(res, sessionId, req);

    const redirectPath = sanitizeRedirectPath(stateEntry.redirectPath, AUTH_REDIRECT_FALLBACK);
    return res.redirect(`/${redirectPath}`);
  } catch (error) {
    console.error("Discord OAuth callback failed:", error.message);
    return res.redirect(buildLoginRedirectUrl({ auth: "failed", reason: "oauth_callback_failed" }));
  }
});

app.get("/api/auth/session", (req, res) => {
  pruneExpiredAuthState();

  const sessionId = getAuthSessionIdFromRequest(req);
  const sessionEntry = getAuthSessionEntry(sessionId);
  if (!sessionEntry || !sessionEntry.user) {
    clearAuthSessionCookie(res, req);
    return res.json({ success: true, authenticated: false });
  }

  const refreshedUser = {
    ...sessionEntry.user,
    plan: getSessionPlanForUser(sessionEntry.user.discordId)
  };
  authSessionStore.set(sessionId, {
    ...sessionEntry,
    user: refreshedUser
  });

  return res.json({
    success: true,
    authenticated: true,
    user: refreshedUser
  });
});

app.post("/api/auth/logout", (req, res) => {
  const sessionId = getAuthSessionIdFromRequest(req);
  if (sessionId) {
    authSessionStore.delete(sessionId);
  }
  clearAuthSessionCookie(res, req);
  return res.json({ success: true });
});

app.use(express.static(path.join(__dirname, "website")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "website", "index.html"));
});

app.get("/premium", (req, res) => {
  res.sendFile(path.join(__dirname, "website", "premium.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "website", "premium-dashboard.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "website", "login.html"));
});

app.get("/profile", (req, res) => {
  res.sendFile(path.join(__dirname, "website", "profile.html"));
});

app.get("/manage-premiums", (req, res) => {
  res.sendFile(path.join(__dirname, "website", "manage-premiums.html"));
});

app.get("/api/live-server-stats", (req, res) => {
  try {
    const payload = readLiveServerSnapshot();
    return res.json(payload);
  } catch (error) {
    const code = String(error?.message || "");
    if (code === "LIVE_STATS_MISSING" || code === "LIVE_STATS_INVALID") {
      return res.status(503).json({
        success: false,
        error: "Live server data is unavailable. Start `npm start` so bot updates website/live-server-stats.json."
      });
    }
    return res.status(500).json({ success: false, error: "Failed to fetch live server stats" });
  }
});

app.get("/api/premium-plans", (req, res) => {
  const plans = Object.fromEntries(
    Object.entries(premiumPlans).map(([key, value]) => [
      key,
      {
        key: value.key,
        label: value.label,
        amount: value.amount,
        amountInRupees: (value.amount / 100).toFixed(2),
        currency: value.currency,
        description: value.description
      }
    ])
  );

  return res.json({
    success: true,
    testMode: isTestAmountEnabled(),
    plans
  });
});

app.post("/api/create-order", async (req, res) => {
  try {
    const { plan, userId, userEmail } = req.body || {};
    const selectedPlan = String(plan || "monthly").trim().toLowerCase();

    if (!premiumPlans[selectedPlan]) {
      return res.status(400).json({ success: false, error: "Invalid plan" });
    }

    if (!isLikelyDiscordId(userId)) {
      return res.status(400).json({ success: false, error: "Valid Discord ID is required" });
    }

    const clientForPayment = getRazorpayClient();
    const planData = premiumPlans[selectedPlan];

    const order = await clientForPayment.orders.create({
      amount: planData.amount,
      currency: planData.currency,
      receipt: `rcpt_${Date.now()}_${String(userId).slice(-6)}`,
      notes: {
        discord_id: String(userId),
        userId: String(userId),
        email: userEmail || "",
        plan: selectedPlan
      }
    });

    return res.json({
      success: true,
      orderId: order.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    console.error("Create order failed:", error.message);
    const isConfigError = error.message === "RAZORPAY_NOT_CONFIGURED";
    return res.status(500).json({
      success: false,
      error: isConfigError
        ? "Razorpay is not configured on server"
        : "Order creation failed"
    });
  }
});

app.post("/api/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    } = req.body || {};

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, error: "Missing payment verification fields" });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ success: false, error: "Razorpay key secret is missing" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (!timingSafeHexEqual(signature, expectedSignature)) {
      return res.status(400).json({ success: false, error: "Invalid payment signature" });
    }

    const clientForPayment = getRazorpayClient();
    const payment = await clientForPayment.payments.fetch(paymentId);
    const paymentNotes = payment.notes || {};
    let mergedNotes = { ...paymentNotes };
    let userId = paymentNotes.discord_id || paymentNotes.userId || paymentNotes.user_id;

    if (!isLikelyDiscordId(userId) && payment.order_id) {
      try {
        const order = await clientForPayment.orders.fetch(payment.order_id);
        const orderNotes = order?.notes || {};
        mergedNotes = { ...orderNotes, ...mergedNotes };
        userId = orderNotes.discord_id || orderNotes.userId || orderNotes.user_id;
      } catch (error) {
        console.warn("Unable to fetch order notes in verify-payment:", error.message);
      }
    }

    if (!isLikelyDiscordId(userId) && payment.subscription_id) {
      try {
        const subscription = await clientForPayment.subscriptions.fetch(payment.subscription_id);
        const subNotes = subscription?.notes || {};
        mergedNotes = { ...subNotes, ...mergedNotes };
        userId = subNotes.discord_id || subNotes.userId || subNotes.user_id;
      } catch (error) {
        console.warn("Unable to fetch subscription notes in verify-payment:", error.message);
      }
    }

    if (!isLikelyDiscordId(userId)) {
      return res.status(400).json({ success: false, error: "Payment does not include a valid Discord ID" });
    }

    const resolvedUserId = String(userId).trim();
    const resolvedEmail = payment.email || mergedNotes.email || "";
    const resolvedPlan = normalizePlan(mergedNotes.plan);

    const premiumUser = paymentUtils.addPremiumUser(
      resolvedUserId,
      resolvedEmail,
      resolvedPlan,
      payment.id,
      payment.amount
    );

    if (process.env.WEBHOOK_URL) {
      webhookNotifier.notifyNewPremium(
        process.env.WEBHOOK_URL,
        resolvedUserId,
        resolvedEmail,
        premiumUser.plan,
        payment.amount
      ).catch((err) => {
        console.error("Premium webhook notify failed:", err.message);
      });
    }

    return res.json({
      success: true,
      message: "Payment verified and premium activated",
      plan: premiumUser.plan,
      expiresAt: premiumUser.expiresAt
    });
  } catch (error) {
    console.error("Verify payment failed:", error.message);
    return res.status(500).json({ success: false, error: "Payment verification failed" });
  }
});

app.get("/api/premium-stats", (req, res) => {
  try {
    const stats = paymentUtils.getPremiumStats();
    return res.json({ success: true, stats });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to fetch premium stats" });
  }
});

app.post("/api/webhook-premium-users", async (req, res) => {
  try {
    const stats = paymentUtils.getPremiumStats();
    const sent = await webhookNotifier.notifyPremiumStats(process.env.WEBHOOK_URL, stats);
    return res.json({ success: sent });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Webhook failed" });
  }
});

app.get("/api/premium-log", (req, res) => {
  try {
    const allUsers = paymentUtils.getAllPremiumUsers();
    const log = Object.entries(allUsers).map(([id, user]) => ({
      userId: id,
      email: user.email || "",
      plan: user.plan || "monthly",
      status: user.isActive ? "Active" : "Inactive",
      purchasedAt: user.purchasedAt,
      expiresAt: user.expiresAt || "Never (Lifetime)"
    }));

    return res.json({
      success: true,
      totalRecords: log.length,
      log: log.sort((a, b) => new Date(b.purchasedAt || 0) - new Date(a.purchasedAt || 0))
    });
  } catch {
    return res.status(500).json({ success: false, error: "Failed to fetch log" });
  }
});

app.listen(port, () => {
  console.log(`Website running on port ${port}`);

  if (!process.env.RAZORPAY_KEY_ID) {
    console.warn("Razorpay keys are missing");
  }
});
