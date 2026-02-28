const fs = require("fs");
const path = require("path");

const GROWTH_DB_FILE = path.join(__dirname, "../database/growth.json");
const DEFAULT_TRIAL_TOKEN_REWARD = 1;

function ensureDBFile() {
  if (!fs.existsSync(GROWTH_DB_FILE)) {
    fs.mkdirSync(path.dirname(GROWTH_DB_FILE), { recursive: true });
    fs.writeFileSync(
      GROWTH_DB_FILE,
      JSON.stringify({ users: {}, referralIndex: {} }, null, 2),
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
    return parsed;
  } catch (error) {
    console.error("Failed to load growth DB:", error.message);
    return { users: {}, referralIndex: {} };
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
      lastTrialRedeemedAt: null
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
  consumeTrialToken,
  loadGrowthDB,
  saveGrowthDB
};
