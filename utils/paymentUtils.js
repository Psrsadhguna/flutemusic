/**
 * Payment Utilities
 * Handles premium user management and verification
 */

const fs = require('fs');
const path = require('path');

const PREMIUM_DB_FILE = path.join(__dirname, '../premium_users.json');

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
 * @param {string} plan - 'monthly' or 'lifetime'
 * @param {string} paymentId - Razorpay Payment ID
 * @param {number} amount - Amount paid in paise
 */
function addPremiumUser(userId, email, plan, paymentId, amount) {
  const users = loadPremiumUsers();
  
  const expiresAt = plan === 'monthly' 
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() 
    : null; // Lifetime has no expiration

  users[userId] = {
    email: email,
    plan: plan,
    paymentId: paymentId,
    amount: amount,
    purchasedAt: new Date().toISOString(),
    expiresAt: expiresAt,
    isActive: true
  };

  savePremiumUsers(users);
  return users[userId];
}

/**
 * Check if user is premium
 * @param {string} userId - Discord User ID
 */
function isPremium(userId) {
  const users = loadPremiumUsers();
  const user = users[userId];

  if (!user || !user.isActive) {
    return false;
  }

  // Check if monthly premium has expired
  if (user.expiresAt) {
    const expiryDate = new Date(user.expiresAt);
    if (new Date() > expiryDate) {
      user.isActive = false;
      savePremiumUsers(users);
      return false;
    }
  }

  return true;
}

/**
 * Get premium user details
 * @param {string} userId - Discord User ID
 */
function getPremiumUser(userId) {
  const users = loadPremiumUsers();
  return users[userId] || null;
}

/**
 * Remove premium status
 * @param {string} userId - Discord User ID
 */
function removePremiumUser(userId) {
  const users = loadPremiumUsers();
  if (users[userId]) {
    users[userId].isActive = false;
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
 * Check and cleanup expired monthly premiums
 */
function cleanupExpiredPremiums() {
  const users = loadPremiumUsers();
  let updated = false;

  for (const userId in users) {
    const user = users[userId];
    if (user.expiresAt && user.isActive) {
      const expiryDate = new Date(user.expiresAt);
      if (new Date() > expiryDate) {
        user.isActive = false;
        updated = true;
      }
    }
  }

  if (updated) {
    savePremiumUsers(users);
  }

  return updated;
}

/**
 * Get premium stats
 */
function getPremiumStats() {
  const users = loadPremiumUsers();
  
  let monthly = 0;
  let lifetime = 0;
  let active = 0;
  let expired = 0;
  let totalRevenue = 0;

  for (const userId in users) {
    const user = users[userId];
    
    if (user.plan === 'monthly') monthly++;
    if (user.plan === 'lifetime') lifetime++;
    if (user.isActive) active++;
    else expired++;
    
    totalRevenue += user.amount || 0;
  }

  return {
    totalUsers: Object.keys(users).length,
    activeUsers: active,
    expiredUsers: expired,
    monthlySubscribers: monthly,
    lifetimeUsers: lifetime,
    totalRevenue: totalRevenue,
    totalRevenueInRupees: (totalRevenue / 100).toFixed(2)
  };
}

module.exports = {
  addPremiumUser,
  isPremium,
  getPremiumUser,
  removePremiumUser,
  getAllPremiumUsers,
  cleanupExpiredPremiums,
  getPremiumStats,
  loadPremiumUsers,
  savePremiumUsers
};
