const fs = require("fs");
const path = require("path");

const GROWTH_DB_FILE = path.join(__dirname, "../database/growth.json");
const DEFAULT_TRIAL_TOKEN_REWARD = 1;
const DEFAULT_VOTE_REWARD_TOKENS = 1;
const DEFAULT_VOTE_WEEKEND_REWARD_TOKENS = 2;
const DEFAULT_VOTE_REWARD_COOLDOWN_MINUTES = 30;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function ensureDBFile() {
  if (!fs.existsSync(GROWTH_DB_FILE)) {
    fs.mkdirSync(path.dirname(GROWTH_DB_FILE), { recursive: true });
    fs.writeFileSync(
      GROWTH_DB_FILE,
      JSON.stringify({ users: {}, referralIndex: {}, inviteRewards: {} }, null, 2),
      "utf8"
    );
  }
}

function loadGrowthDB() {
  try {
    ensureDBFile();
    const parsed = JSON.parse(fs.readFileSync(GROWTH_DB_FILE, "utf8"));
    if (!parsed.users || typeof parsed.users !== "object") parsed.users = {};
    if (!parsed.referralIndex || typeof parsed.referralIndex !== "object") {
      parsed.referralIndex = {};
    }
    if (!parsed.inviteRewards || typeof parsed.inviteRewards !== "object") {
      parsed.inviteRewards = {};
    }
    return parsed;
  } catch (error) {
    console.error("Failed to load growth DB:", error.message);
    return { users: {}, referralIndex: {}, inviteRewards: {} };
  }
}

function saveGrowthDB(data) {
  try {
    ensureDBFile();
    fs.writeFileSync(GROWTH_DB_FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Failed to save growth DB:", error.message);
    return false;
  }
}

function buildReferralCode(userId) {
  const suffix = String(userId || "").slice(-6);
  return `FM${suffix}`.toUpperCase();
}

function getOrCreateProfile(userId, db = null) {
  const data = db || loadGrowthDB();
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    throw new Error("User ID is required");
  }

  if (!data.users[normalizedUserId]) {
    const referralCode = buildReferralCode(normalizedUserId);
    data.users[normalizedUserId] = {
      userId: normalizedUserId,
      referralCode,
      referredBy: null,
      referrals: [],
      trialTokens: 0,
      createdAt: new Date().toISOString(),
      campaignJoinedAt: null,
      lastTrialRedeemedAt: null,
      inviteRewardGuilds: [],
      voteRewards: 0,
      lastVoteRewardAt: null
    };
    data.referralIndex[referralCode] = normalizedUserId;
  }

  const profile = data.users[normalizedUserId];
  if (!profile.referralCode) {
    profile.referralCode = buildReferralCode(normalizedUserId);
  }
  data.referralIndex[profile.referralCode] = normalizedUserId;

  if (!Array.isArray(profile.referrals)) profile.referrals = [];
  if (!Number.isFinite(profile.trialTokens)) profile.trialTokens = 0;
  if (!Array.isArray(profile.inviteRewardGuilds)) profile.inviteRewardGuilds = [];
  if (!Number.isFinite(profile.voteRewards)) profile.voteRewards = 0;
  if (typeof profile.lastVoteRewardAt !== "string") profile.lastVoteRewardAt = null;

  return profile;
}

function getReferralCode(userId) {
  const data = loadGrowthDB();
  const profile = getOrCreateProfile(userId, data);
  saveGrowthDB(data);
  return profile.referralCode;
}

function getUserGrowthSummary(userId) {
  const data = loadGrowthDB();
  const profile = getOrCreateProfile(userId, data);
  saveGrowthDB(data);

  return {
    referralCode: profile.referralCode,
    referredBy: profile.referredBy,
    referrals: profile.referrals.slice(),
    referralCount: profile.referrals.length,
    trialTokens: profile.trialTokens,
    campaignJoinedAt: profile.campaignJoinedAt,
    lastTrialRedeemedAt: profile.lastTrialRedeemedAt
  };
}

function claimReferral(userId, referralCode) {
  const data = loadGrowthDB();
  const claimant = getOrCreateProfile(userId, data);

  const normalizedCode = String(referralCode || "").trim().toUpperCase();
  if (!normalizedCode) {
    return { ok: false, reason: "CODE_REQUIRED" };
  }

  const ownerId = data.referralIndex[normalizedCode];
  if (!ownerId) {
    return { ok: false, reason: "CODE_NOT_FOUND" };
  }

  if (String(ownerId) === claimant.userId) {
    return { ok: false, reason: "SELF_REFERRAL_NOT_ALLOWED" };
  }

  if (claimant.referredBy) {
    return { ok: false, reason: "ALREADY_CLAIMED" };
  }

  const owner = getOrCreateProfile(ownerId, data);
  claimant.referredBy = owner.userId;
  claimant.trialTokens += DEFAULT_TRIAL_TOKEN_REWARD;

  if (!owner.referrals.includes(claimant.userId)) {
    owner.referrals.push(claimant.userId);
  }
  owner.trialTokens += DEFAULT_TRIAL_TOKEN_REWARD;

  saveGrowthDB(data);
  return {
    ok: true,
    ownerId: owner.userId,
    rewardTokens: DEFAULT_TRIAL_TOKEN_REWARD,
    claimantTokens: claimant.trialTokens,
    ownerTokens: owner.trialTokens
  };
}

function grantCampaignTrialToken(userId) {
  const data = loadGrowthDB();
  const profile = getOrCreateProfile(userId, data);
  if (!profile.campaignJoinedAt) {
    profile.campaignJoinedAt = new Date().toISOString();
    profile.trialTokens += 1;
    saveGrowthDB(data);
    return {
      ok: true,
      granted: true,
      trialTokens: profile.trialTokens
    };
  }

  saveGrowthDB(data);
  return {
    ok: true,
    granted: false,
    trialTokens: profile.trialTokens
  };
}

function grantInviteJoinTrialToken(userId, guildId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return { ok: false, reason: "USER_ID_REQUIRED" };
  }

  const normalizedGuildId = String(guildId || "").trim();
  if (!normalizedGuildId) {
    return { ok: false, reason: "GUILD_ID_REQUIRED" };
  }

  const data = loadGrowthDB();
  const profile = getOrCreateProfile(normalizedUserId, data);

  if (data.inviteRewards[normalizedGuildId]) {
    saveGrowthDB(data);
    return {
      ok: true,
      granted: false,
      reason: "GUILD_ALREADY_REWARDED",
      trialTokens: profile.trialTokens
    };
  }

  const nowIso = new Date().toISOString();

  profile.trialTokens += DEFAULT_TRIAL_TOKEN_REWARD;
  if (!profile.inviteRewardGuilds.includes(normalizedGuildId)) {
    profile.inviteRewardGuilds.push(normalizedGuildId);
  }

  data.inviteRewards[normalizedGuildId] = {
    guildId: normalizedGuildId,
    userId: profile.userId,
    rewardedAt: nowIso,
    rewardTokens: DEFAULT_TRIAL_TOKEN_REWARD
  };

  saveGrowthDB(data);
  return {
    ok: true,
    granted: true,
    reason: "INVITE_REWARDED",
    rewardTokens: DEFAULT_TRIAL_TOKEN_REWARD,
    trialTokens: profile.trialTokens
  };
}

function grantVoteTrialToken(userId, options = {}) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return { ok: false, reason: "USER_ID_REQUIRED" };
  }

  const data = loadGrowthDB();
  const profile = getOrCreateProfile(normalizedUserId, data);

  const cooldownMinutes = parsePositiveInt(
    process.env.VOTE_REWARD_COOLDOWN_MINUTES,
    DEFAULT_VOTE_REWARD_COOLDOWN_MINUTES
  );
  const cooldownMs = cooldownMinutes * 60 * 1000;

  const nowMs = Date.now();
  const lastVoteAtMs = profile.lastVoteRewardAt
    ? Date.parse(profile.lastVoteRewardAt)
    : Number.NaN;
  const forceReward = options.force === true;

  if (!forceReward && Number.isFinite(lastVoteAtMs) && nowMs - lastVoteAtMs < cooldownMs) {
    const retryAfterMs = cooldownMs - (nowMs - lastVoteAtMs);
    saveGrowthDB(data);
    return {
      ok: true,
      granted: false,
      reason: "COOLDOWN_ACTIVE",
      retryAfterMs,
      trialTokens: profile.trialTokens,
      voteRewards: profile.voteRewards
    };
  }

  const baseReward = parsePositiveInt(
    process.env.VOTE_REWARD_TOKENS,
    DEFAULT_VOTE_REWARD_TOKENS
  );
  const weekendReward = parsePositiveInt(
    process.env.VOTE_WEEKEND_REWARD_TOKENS,
    DEFAULT_VOTE_WEEKEND_REWARD_TOKENS
  );
  const isWeekend = options.isWeekend === true;
  const rewardTokens = isWeekend ? weekendReward : baseReward;
  const grantedAt = new Date(nowMs).toISOString();

  profile.trialTokens += rewardTokens;
  profile.voteRewards += 1;
  profile.lastVoteRewardAt = grantedAt;

  saveGrowthDB(data);
  return {
    ok: true,
    granted: true,
    reason: "VOTE_REWARDED",
    rewardTokens,
    trialTokens: profile.trialTokens,
    voteRewards: profile.voteRewards,
    lastVoteRewardAt: grantedAt
  };
}

function consumeTrialToken(userId) {
  const data = loadGrowthDB();
  const profile = getOrCreateProfile(userId, data);

  if (profile.trialTokens <= 0) {
    return { ok: false, reason: "NO_TOKENS" };
  }

  profile.trialTokens -= 1;
  profile.lastTrialRedeemedAt = new Date().toISOString();
  saveGrowthDB(data);

  return {
    ok: true,
    remainingTokens: profile.trialTokens,
    redeemedAt: profile.lastTrialRedeemedAt
  };
}

module.exports = {
  getReferralCode,
  getUserGrowthSummary,
  claimReferral,
  grantCampaignTrialToken,
  grantInviteJoinTrialToken,
  grantVoteTrialToken,
  consumeTrialToken,
  loadGrowthDB,
  saveGrowthDB
};
