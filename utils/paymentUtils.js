/**
 * Payment Utilities
 * Handles premium user management and verification
 */

const fs = require('fs');
const path = require('path');
const { getPlan, normalizePlan, getPlanExpiryMs } = require('./premiumPlans');

const PREMIUM_DB_FILE = path.join(__dirname, '../premium_users.json');
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TRIAL_DAYS = 3;
const STARTER_TRIAL_REASON = 'starter_trial';

function parseIsoToMs(iso) {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) ? value : null;
}

function isExpiredUser(user, nowMs = Date.now()) {
  if (!user || !user.expiresAt) return false;
  const expiryMs = parseIsoToMs(user.expiresAt);
  if (expiryMs === null) return true;
  return nowMs > expiryMs;
}

function getPaymentHistory(user) {
  return Array.isArray(user?.paymentHistory) ? user.paymentHistory : [];
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function hasActiveLifetime(user) {
  return (
    user?.plan === 'lifetime' &&
    user?.isActive === true &&
    !user?.expiresAt
  );
}

function isUserActive(user, nowMs = Date.now()) {
  return Boolean(user?.isActive) && !isExpiredUser(user, nowMs);
}

function getNormalizedTrialMeta(user) {
  const source = user && typeof user.trial === 'object'
    ? user.trial
    : {};

  const remindersSent = source.remindersSent && typeof source.remindersSent === 'object'
    ? { ...source.remindersSent }
    : {};

  return {
    days: parsePositiveInt(source.days, 0),
    reason: typeof source.reason === 'string' ? source.reason : '',
    grantedAt: typeof source.grantedAt === 'string' ? source.grantedAt : null,
    uses: parsePositiveInt(source.uses, 0),
    starterUsed: source.starterUsed === true,
    lastReason: typeof source.lastReason === 'string' ? source.lastReason : null,
    lastGrantedAt: typeof source.lastGrantedAt === 'string' ? source.lastGrantedAt : null,
    remindersSent,
    expiryNotifiedAt: typeof source.expiryNotifiedAt === 'string' ? source.expiryNotifiedAt : null,
    expiryNotifiedFor: typeof source.expiryNotifiedFor === 'string' ? source.expiryNotifiedFor : null
  };
}

function findPaymentOwner(users, paymentId) {
  if (!paymentId) return null;

  for (const [userId, user] of Object.entries(users)) {
    if (!user) continue;

    if (user.paymentId === paymentId) {
      return userId;
    }

    const history = getPaymentHistory(user);
    if (history.some((entry) => entry && entry.paymentId === paymentId)) {
      return userId;
    }
  }

  return null;
}

/**
 * Load premium users from database file
 */
function loadPremiumUsers() {
  try {
    if (fs.existsSync(PREMIUM_DB_FILE)) {
      const data = fs.readFileSync(PREMIUM_DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading premium users:', error);
  }
  return {};
}

/**
 * Save premium users to database file
 */
function savePremiumUsers(users) {
  try {
    fs.writeFileSync(PREMIUM_DB_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving premium users:', error);
    return false;
  }
}

/**
 * Add a user to premium
 * @param {string} userId - Discord User ID
 * @param {string} email - User email
 * @param {string} plan - 'weekly', 'monthly' or 'lifetime'
 * @param {string} paymentId - Razorpay Payment ID
 * @param {number} amount - Amount paid in paise
 */
function addPremiumUser(userId, email, plan, paymentId, amount) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const users = loadPremiumUsers();
  const normalizedUserId = String(userId).trim();
  const normalizedPlan = normalizePlan(plan);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const existing = users[normalizedUserId] || {};
  const existingHistory = getPaymentHistory(existing);

  if (paymentId) {
    const ownerId = findPaymentOwner(users, paymentId);
    if (ownerId && ownerId !== normalizedUserId) {
      throw new Error(`Payment ${paymentId} is already linked to another user`);
    }

    const alreadyProcessedForUser = existingHistory.some(
      (entry) => entry && entry.paymentId === paymentId
    );
    if (alreadyProcessedForUser || existing.paymentId === paymentId) {
      return existing;
    }
  }

  const currentExpiryMs = parseIsoToMs(existing.expiresAt);
  const renewalBaseMs = currentExpiryMs && currentExpiryMs > nowMs
    ? currentExpiryMs
    : nowMs;

  const activeLifetime = hasActiveLifetime(existing);

  const finalPlan = activeLifetime ? 'lifetime' : normalizedPlan;
  const finalPlanMeta = getPlan(finalPlan);
  const nextExpiryMs = getPlanExpiryMs(finalPlan, renewalBaseMs);
  const nextExpiryIso = nextExpiryMs ? new Date(nextExpiryMs).toISOString() : null;

  const effectiveAmount = Number.isFinite(amount) ? amount : finalPlanMeta.amount;

  const nextHistory = existingHistory.slice(-199);
  nextHistory.push({
    paymentId: paymentId || null,
    plan: normalizedPlan,
    amount: effectiveAmount,
    purchasedAt: nowIso
  });

  users[normalizedUserId] = {
    ...existing,
    email: email || existing.email || '',
    plan: finalPlan,
    paymentId: paymentId || existing.paymentId || null,
    amount: effectiveAmount,
    purchasedAt: nowIso,
    expiresAt: finalPlan === 'lifetime' ? null : nextExpiryIso,
    isActive: true,
    paymentHistory: nextHistory
  };

  savePremiumUsers(users);
  return users[normalizedUserId];
}

/**
 * Grant trial premium for a limited number of days.
 * @param {string} userId
 * @param {number} days
 * @param {string} reason
 */
function grantTrialPremium(userId, days = 3, reason = 'trial') {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const validDays = parsePositiveInt(days, DEFAULT_TRIAL_DAYS);
  const users = loadPremiumUsers();
  const normalizedUserId = String(userId).trim();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const normalizedReason = String(reason || 'trial').trim().toLowerCase() || 'trial';

  const existing = users[normalizedUserId] || {};
  const existingTrialMeta = getNormalizedTrialMeta(existing);

  if (hasActiveLifetime(existing)) {
    return existing;
  }

  if (isUserActive(existing, nowMs) && existing.plan && existing.plan !== 'trial') {
    return existing;
  }

  const currentExpiryMs = parseIsoToMs(existing.expiresAt);
  const baseMs = currentExpiryMs && currentExpiryMs > nowMs
    ? currentExpiryMs
    : nowMs;
  const nextExpiryIso = new Date(baseMs + (validDays * DAY_MS)).toISOString();

  const nextHistory = getPaymentHistory(existing).slice(-199);
  nextHistory.push({
    paymentId: null,
    plan: 'trial',
    amount: 0,
    purchasedAt: nowIso,
    reason: normalizedReason
  });

  const starterUsed = existingTrialMeta.starterUsed || normalizedReason === STARTER_TRIAL_REASON;
  const nextTrialMeta = {
    ...existingTrialMeta,
    days: validDays,
    reason: normalizedReason,
    grantedAt: nowIso,
    uses: existingTrialMeta.uses + 1,
    starterUsed,
    lastReason: normalizedReason,
    lastGrantedAt: nowIso,
    remindersSent: {},
    expiryNotifiedAt: null,
    expiryNotifiedFor: null
  };

  users[normalizedUserId] = {
    ...existing,
    email: existing.email || '',
    plan: 'trial',
    paymentId: existing.paymentId || null,
    amount: 0,
    purchasedAt: nowIso,
    expiresAt: nextExpiryIso,
    isActive: true,
    paymentHistory: nextHistory,
    trial: nextTrialMeta
  };

  savePremiumUsers(users);
  return users[normalizedUserId];
}

function canUseStarterTrial(userId) {
  if (!userId) {
    return {
      ok: false,
      reason: 'USER_ID_REQUIRED'
    };
  }

  const users = loadPremiumUsers();
  const normalizedUserId = String(userId).trim();
  const user = users[normalizedUserId] || null;
  const trialMeta = getNormalizedTrialMeta(user);

  if (trialMeta.starterUsed) {
    return {
      ok: false,
      reason: 'STARTER_ALREADY_USED',
      trialMeta
    };
  }

  if (hasActiveLifetime(user)) {
    return {
      ok: false,
      reason: 'LIFETIME_ALREADY_ACTIVE',
      trialMeta
    };
  }

  if (isUserActive(user)) {
    return {
      ok: false,
      reason: 'PREMIUM_ALREADY_ACTIVE',
      plan: user?.plan || null,
      trialMeta
    };
  }

  return {
    ok: true,
    reason: 'ELIGIBLE',
    trialMeta
  };
}

/**
 * Check if user is premium
 * @param {string} userId - Discord User ID
 */
function isPremium(userId) {
  if (!userId) return false;

  const users = loadPremiumUsers();
  const normalizedUserId = String(userId).trim();
  const user = users[normalizedUserId];

  if (!user || !user.isActive) {
    return false;
  }

  if (isExpiredUser(user)) {
    user.isActive = false;
    savePremiumUsers(users);
    return false;
  }

  return true;
}

/**
 * Get premium user details
 * @param {string} userId - Discord User ID
 */
function getPremiumUser(userId) {
  if (!userId) return null;
  const users = loadPremiumUsers();
  return users[String(userId).trim()] || null;
}

/**
 * Remove premium status
 * @param {string} userId - Discord User ID
 */
function removePremiumUser(userId) {
  if (!userId) return false;
  const users = loadPremiumUsers();
  const normalizedUserId = String(userId).trim();
  if (users[normalizedUserId]) {
    users[normalizedUserId].isActive = false;
    savePremiumUsers(users);
    return true;
  }
  return false;
}

/**
 * Get all premium users
 */
function getAllPremiumUsers() {
  return loadPremiumUsers();
}

/**
 * Check and cleanup expired premiums
 */
function cleanupExpiredPremiums() {
  const users = loadPremiumUsers();
  let updated = false;
  const expiredUserIds = [];
  const expiredUsers = [];
  const nowMs = Date.now();

  for (const userId in users) {
    const user = users[userId];
    if (user && user.isActive && isExpiredUser(user, nowMs)) {
      expiredUsers.push({
        userId,
        plan: user.plan || null,
        expiresAt: user.expiresAt || null,
        trial: getNormalizedTrialMeta(user)
      });
      user.isActive = false;
      expiredUserIds.push(userId);
      updated = true;
    }
  }

  if (updated) {
    savePremiumUsers(users);
  }

  return {
    updated,
    expiredUserIds,
    expiredUsers
  };
}

function listActiveTrialUsers() {
  const users = loadPremiumUsers();
  const nowMs = Date.now();
  const trialUsers = [];

  for (const [userId, user] of Object.entries(users)) {
    if (!user || user.isActive !== true || user.plan !== 'trial') {
      continue;
    }

    const expiryMs = parseIsoToMs(user.expiresAt);
    if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) {
      continue;
    }

    trialUsers.push({
      userId,
      expiresAt: user.expiresAt,
      msRemaining: expiryMs - nowMs,
      trial: getNormalizedTrialMeta(user)
    });
  }

  trialUsers.sort((left, right) => left.msRemaining - right.msRemaining);
  return trialUsers;
}

function markTrialReminderSent(userId, reminderKey, sentAtIso = new Date().toISOString()) {
  if (!userId || !reminderKey) {
    return false;
  }

  const users = loadPremiumUsers();
  const normalizedUserId = String(userId).trim();
  const user = users[normalizedUserId];

  if (!user) {
    return false;
  }

  const trialMeta = getNormalizedTrialMeta(user);
  trialMeta.remindersSent = {
    ...trialMeta.remindersSent,
    [String(reminderKey)]: sentAtIso
  };
  user.trial = trialMeta;

  return savePremiumUsers(users);
}

function markTrialExpiryNotified(userId, expiryIso, sentAtIso = new Date().toISOString()) {
  if (!userId || !expiryIso) {
    return false;
  }

  const users = loadPremiumUsers();
  const normalizedUserId = String(userId).trim();
  const user = users[normalizedUserId];

  if (!user) {
    return false;
  }

  const trialMeta = getNormalizedTrialMeta(user);
  trialMeta.expiryNotifiedAt = sentAtIso;
  trialMeta.expiryNotifiedFor = expiryIso;
  user.trial = trialMeta;

  return savePremiumUsers(users);
}

function getTrialMetadata(userId) {
  if (!userId) {
    return getNormalizedTrialMeta(null);
  }

  const users = loadPremiumUsers();
  const user = users[String(userId).trim()] || null;
  return getNormalizedTrialMeta(user);
}

/**
 * Get premium stats
 */
function getPremiumStats() {
  const users = loadPremiumUsers();
  
  let weekly = 0;
  let monthly = 0;
  let lifetime = 0;
  let trial = 0;
  let active = 0;
  let expired = 0;
  let totalRevenue = 0;

  for (const userId in users) {
    const user = users[userId];
    
    if (user.plan === 'weekly') weekly++;
    if (user.plan === 'monthly') monthly++;
    if (user.plan === 'lifetime') lifetime++;
    if (user.plan === 'trial') trial++;
    if (user.isActive) active++;
    else expired++;
    
    totalRevenue += user.amount || 0;
  }

  return {
    totalUsers: Object.keys(users).length,
    activeUsers: active,
    expiredUsers: expired,
    weeklySubscribers: weekly,
    monthlySubscribers: monthly,
    lifetimeUsers: lifetime,
    trialUsers: trial,
    totalRevenue: totalRevenue,
    totalRevenueInRupees: (totalRevenue / 100).toFixed(2)
  };
}

module.exports = {
  addPremiumUser,
  grantTrialPremium,
  canUseStarterTrial,
  listActiveTrialUsers,
  markTrialReminderSent,
  markTrialExpiryNotified,
  getTrialMetadata,
  isPremium,
  getPremiumUser,
  removePremiumUser,
  getAllPremiumUsers,
  cleanupExpiredPremiums,
  getPremiumStats,
  loadPremiumUsers,
  savePremiumUsers
};
