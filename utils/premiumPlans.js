const DAY_MS = 24 * 60 * 60 * 1000;

const PREMIUM_PLANS = {
  weekly: {
    key: "weekly",
    label: "Weekly",
    amount: 9900,
    currency: "INR",
    durationDays: 7,
    description: "7 days of premium features"
  },
  monthly: {
    key: "monthly",
    label: "Monthly",
    amount: 29900,
    currency: "INR",
    durationDays: 30,
    description: "30 days of premium features"
  },
  lifetime: {
    key: "lifetime",
    label: "Lifetime",
    amount: 99900,
    currency: "INR",
    durationDays: null,
    description: "Lifetime premium access"
  }
};

function normalizePlan(plan) {
  if (!plan || typeof plan !== "string") {
    return "monthly";
  }

  const normalized = plan.trim().toLowerCase();
  return PREMIUM_PLANS[normalized] ? normalized : "monthly";
}

function getPlan(plan) {
  return PREMIUM_PLANS[normalizePlan(plan)];
}

function listPlans() {
  return PREMIUM_PLANS;
}

function getPlanExpiryMs(plan, baseMs = Date.now()) {
  const selected = getPlan(plan);
  if (!selected.durationDays) {
    return null;
  }
  return baseMs + (selected.durationDays * DAY_MS);
}

module.exports = {
  PREMIUM_PLANS,
  normalizePlan,
  getPlan,
  listPlans,
  getPlanExpiryMs
};
