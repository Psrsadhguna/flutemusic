/**
 * Payment Utilities
 * Handles premium user management and verification
 */

const fs = require('fs');
const path = require('path');
const { getPlan, normalizePlan, getPlanExpiryMs } = require('./premiumPlans');

const PREMIUM_DB_FILE = path.join(__dirname, '../premium_users.json');

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

  const hasActiveLifetime =
    existing.plan === 'lifetime' &&
    existing.isActive === true &&
    !existing.expiresAt;

  const finalPlan = hasActiveLifetime ? 'lifetime' : normalizedPlan;
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

  const validDays = parsePositiveInt(days, 3);
  const users = loadPremiumUsers();
  const normalizedUserId = String(userId).trim();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const existing = users[normalizedUserId] || {};

  const hasActiveLifetime =
    existing.plan === 'lifetime' &&
    existing.isActive === true &&
    !existing.expiresAt;

  if (hasActiveLifetime) {
    return existing;
  }

  const currentExpiryMs = parseIsoToMs(existing.expiresAt);
  const baseMs = currentExpiryMs && currentExpiryMs > nowMs
    ? currentExpiryMs
    : nowMs;
  const nextExpiryIso = new Date(baseMs + (validDays * 24 * 60 * 60 * 1000)).toISOString();

  const nextHistory = getPaymentHistory(existing).slice(-199);
  nextHistory.push({
    paymentId: null,
    plan: 'trial',
    amount: 0,
    purchasedAt: nowIso,
    reason
  });

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
    trial: {
      days: validDays,
      reason,
      grantedAt: nowIso
    }
  };

  savePremiumUsers(users);
  return users[normalizedUserId];
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
  const nowMs = Date.now();

  for (const userId in users) {
    const user = users[userId];
    if (user && user.isActive && isExpiredUser(user, nowMs)) {
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
    expiredUserIds
  };
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
  isPremium,
  getPremiumUser,
  removePremiumUser,
  getAllPremiumUsers,
  cleanupExpiredPremiums,
  getPremiumStats,
  loadPremiumUsers,
  savePremiumUsers
};
