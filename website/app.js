const SESSION_KEY = "flute_dashboard_session_v1";
const LIVE_STATS_ENDPOINT = "/api/live-server-stats";

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = byId(id);
  if (node) {
    node.textContent = value;
  }
}

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function requireSession() {
  const session = getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

function attachNavToggle() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const menu = document.querySelector("[data-nav-menu]");
  if (!toggle || !menu) {
    return;
  }

  toggle.addEventListener("click", () => {
    menu.classList.toggle("is-open");
  });
}

function attachLogoutHandlers() {
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      localStorage.removeItem(SESSION_KEY);
      window.location.href = "login.html";
    });
  });
}

function renderUnavailableServerCard(message) {
  const wrapper = byId("server-list");
  if (!wrapper) {
    return;
  }

  wrapper.innerHTML = `
    <article class="server-card">
      <header class="server-top">
        <img src="image.png" alt="Flute logo" class="server-logo">
        <div>
          <h3 class="server-name">Live data unavailable</h3>
          <p class="server-sub">${message}</p>
        </div>
      </header>
    </article>
  `;
}

function renderServerCards(servers) {
  const wrapper = byId("server-list");
  if (!wrapper) {
    return;
  }

  if (!Array.isArray(servers) || servers.length === 0) {
    renderUnavailableServerCard("Start the bot process to fetch active guild names and logos.");
    return;
  }

  wrapper.innerHTML = servers.map((server) => `
    <article class="server-card">
      <header class="server-top">
        <img src="${server.logo || "image.png"}" alt="${server.name || "Server"} logo" class="server-logo">
        <div>
          <h3 class="server-name">${server.name || "Unknown Server"}</h3>
          <p class="server-sub">${server.status || "Active"}</p>
        </div>
      </header>
      <div class="metric-grid">
        <div class="metric-cell">
          <p>Played</p>
          <strong>${formatNumber(server.played)}</strong>
        </div>
        <div class="metric-cell">
          <p>Listening Time</p>
          <strong>${formatNumber(server.listeningHours)}h</strong>
        </div>
        <div class="metric-cell">
          <p>Views</p>
          <strong>${formatNumber(server.views)}</strong>
        </div>
      </div>
    </article>
  `).join("");
}

function applyPlatformStats(platform) {
  const data = platform || {};
  setText("stat-songs", formatNumber(data.totalSongsPlayed));
  setText("stat-hours", `${formatNumber(data.totalListeningHours)}h`);
  setText("stat-views", formatNumber(data.totalServerViews));
  setText("stat-active", formatNumber(data.activeServers));
  setText("live-servers", formatNumber(data.liveServers || data.activeServers));
  setText("live-members", formatNumber(data.liveMembers));
}

function applyDashboardStats(platform) {
  const data = platform || {};
  setText("dash-songs", formatNumber(data.totalSongsPlayed));
  setText("dash-hours", `${formatNumber(data.totalListeningHours)}h`);
  setText("dash-servers", formatNumber(data.activeServers));
  setText("live-servers", formatNumber(data.liveServers || data.activeServers));
}

async function fetchLiveServerStats({ trackViews = true } = {}) {
  const response = await fetch(`${LIVE_STATS_ENDPOINT}?trackViews=${trackViews ? 1 : 0}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to fetch live server stats");
  }

  const payload = await response.json();
  if (!payload?.success) {
    throw new Error(payload?.error || "Invalid live server payload");
  }

  return payload;
}

async function loadFallbackLiveCounts() {
  try {
    const response = await fetch("status.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    setText("live-servers", formatNumber(data.servers));
    setText("live-members", formatNumber(data.members));
    if (byId("stat-active")) {
      setText("stat-active", formatNumber(data.servers));
    }
  } catch {
    // Ignore fallback errors.
  }
}

async function initHomePage() {
  try {
    const livePayload = await fetchLiveServerStats({ trackViews: true });
    renderServerCards(livePayload.servers);
    applyPlatformStats(livePayload.platform);
  } catch (error) {
    renderUnavailableServerCard("Unable to read live endpoint now.");
    applyPlatformStats({
      totalSongsPlayed: 0,
      totalListeningHours: 0,
      totalServerViews: 0,
      activeServers: 0,
      liveServers: 0,
      liveMembers: 0
    });
    await loadFallbackLiveCounts();
  }
}

function initLoginPage() {
  const form = byId("login-form");
  if (!form) {
    return;
  }

  const existing = getSession();
  if (existing && byId("already-login")) {
    byId("already-login").classList.remove("hidden");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const username = String(byId("login-name")?.value || "").trim();
    const discordId = String(byId("login-id")?.value || "").trim();
    const avatar = String(byId("login-avatar")?.value || "").trim();
    const plan = String(byId("login-plan")?.value || "free").trim();

    if (!username) {
      alert("Enter Discord username.");
      return;
    }

    saveSession({
      username,
      discordId: discordId || "Not provided",
      avatar: avatar || "image.png",
      plan,
      joinedAt: new Date().toISOString()
    });

    window.location.href = "premium-dashboard.html";
  });

  const demoButton = byId("demo-discord");
  if (demoButton) {
    demoButton.addEventListener("click", () => {
      byId("login-name").value = "FluteUser#247";
      byId("login-id").value = "1350045852698435686";
      byId("login-avatar").value = "image.png";
      byId("login-plan").value = "monthly";
    });
  }
}

function renderSessionInCommonPlaces(session) {
  setText("session-name", session.username);
  setText("session-name-card", session.username);
  setText("profile-preview-name", session.username);
  setText("session-id", session.discordId);
  setText("session-plan", String(session.plan || "free").toUpperCase());

  const avatarNodes = document.querySelectorAll("[data-session-avatar]");
  avatarNodes.forEach((node) => {
    node.src = session.avatar || "image.png";
  });
}

async function initDashboardPage() {
  const session = requireSession();
  if (!session) {
    return;
  }

  renderSessionInCommonPlaces(session);

  try {
    const livePayload = await fetchLiveServerStats({ trackViews: false });
    applyDashboardStats(livePayload.platform);
  } catch {
    applyDashboardStats({
      totalSongsPlayed: 0,
      totalListeningHours: 0,
      activeServers: 0,
      liveServers: 0
    });
  }
}

function initProfilePage() {
  const session = requireSession();
  if (!session) {
    return;
  }

  renderSessionInCommonPlaces(session);

  const nameInput = byId("profile-name");
  const idInput = byId("profile-id");
  const avatarInput = byId("profile-avatar");
  const planInput = byId("profile-plan");
  const form = byId("profile-form");
  const savedMessage = byId("profile-saved");

  if (nameInput) nameInput.value = session.username || "";
  if (idInput) idInput.value = session.discordId || "";
  if (avatarInput) avatarInput.value = session.avatar || "";
  if (planInput) planInput.value = session.plan || "free";

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextSession = {
      ...session,
      username: String(nameInput?.value || "").trim() || session.username,
      discordId: String(idInput?.value || "").trim() || session.discordId,
      avatar: String(avatarInput?.value || "").trim() || "image.png",
      plan: String(planInput?.value || "free")
    };
    saveSession(nextSession);
    renderSessionInCommonPlaces(nextSession);
    if (savedMessage) {
      savedMessage.classList.remove("hidden");
    }
  });
}

function renderPlanList(plans) {
  const wrapper = byId("plan-list");
  if (!wrapper) {
    return;
  }

  wrapper.innerHTML = plans.map((plan) => `
    <article class="dash-card">
      <p class="pill">${plan.label}</p>
      <p class="dash-value">${plan.price}</p>
      <p>${plan.description}</p>
      <button class="btn btn-outline btn-small" type="button" data-select-plan="${plan.key}">
        Select ${plan.label}
      </button>
    </article>
  `).join("");
}

async function loadPremiumPlans() {
  const fallbackPlans = [
    { key: "monthly", label: "Monthly", price: "Rs.149", description: "Unlimited queue and premium filters." },
    { key: "quarterly", label: "Quarterly", price: "Rs.399", description: "Best for active music communities." },
    { key: "lifetime", label: "Lifetime", price: "Rs.999", description: "One time payment and permanent access." }
  ];

  try {
    const response = await fetch("/api/premium-plans", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("plan api failed");
    }
    const payload = await response.json();
    if (!payload?.success || !payload.plans) {
      throw new Error("invalid plan payload");
    }

    return Object.values(payload.plans).map((plan) => ({
      key: plan.key,
      label: plan.label,
      price: `Rs.${formatNumber(plan.amountInRupees)}`,
      description: plan.description || "Premium plan"
    }));
  } catch {
    return fallbackPlans;
  }
}

async function initManagePremiumPage() {
  const session = requireSession();
  if (!session) {
    return;
  }

  renderSessionInCommonPlaces(session);
  const plans = await loadPremiumPlans();
  renderPlanList(plans);

  setText("current-plan", String(session.plan || "free").toUpperCase());

  const selectButtons = document.querySelectorAll("[data-select-plan]");
  selectButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedPlan = button.getAttribute("data-select-plan");
      const nextSession = { ...session, plan: selectedPlan || session.plan };
      saveSession(nextSession);
      setText("current-plan", String(nextSession.plan || "free").toUpperCase());
      alert(`Plan updated to ${selectedPlan}.`);
    });
  });
}

function initPage() {
  attachNavToggle();
  attachLogoutHandlers();

  const page = document.body.getAttribute("data-page");
  if (!page) {
    return;
  }

  if (page === "home") initHomePage();
  if (page === "login") initLoginPage();
  if (page === "dashboard") initDashboardPage();
  if (page === "profile") initProfilePage();
  if (page === "manage-premiums") initManagePremiumPage();
}

document.addEventListener("DOMContentLoaded", initPage);
