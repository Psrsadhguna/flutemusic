const SESSION_KEY = "flute_dashboard_session_v1";
const LIVE_STATS_ENDPOINT = "/api/live-server-stats";
const LIVE_STATS_CACHE_KEY = "flute_live_server_stats_v1";
const AUTH_SESSION_ENDPOINT = "/api/auth/session";
const AUTH_LOGOUT_ENDPOINT = "/api/auth/logout";
const DISCORD_LOGIN_ENDPOINT = "/auth/discord";
const LOGO_ASSET = "image.png?v=20260301";
const GIF_LOGO_ASSET = "logo.gif?v=20260301b";
const GIF_MIN_LOOP_REFRESH_MS = 5000;
const DEFAULT_GIF_LOOP_REFRESH_MS = 12000;
const GIF_LOOP_TIMERS = new WeakMap();
const DEFAULT_SERVER_LOGO = LOGO_ASSET;
const SERVER_PAGE_SIZE_DESKTOP = 6;
const SERVER_PAGE_SIZE_MOBILE = 4;
const HOME_STATS_REFRESH_MS = 15000;
const serverPaginationState = {
  allServers: [],
  currentPage: 1
};
let serverResizeTimerId = null;
let hasBoundServerResizeHandler = false;
let homeStatsIntervalId = null;

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

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore cache remove failures.
  }
}

function getCachedLiveStats() {
  try {
    const raw = localStorage.getItem(LIVE_STATS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedLiveStats(payload) {
  try {
    localStorage.setItem(LIVE_STATS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures.
  }
}

function normalizeRemoteSession(payload) {
  const user = payload?.user || payload || {};
  const discordId = String(user.discordId || "").trim();
  if (!discordId) {
    return null;
  }

  return {
    username: String(user.username || user.discordUsername || "Discord User").trim() || "Discord User",
    discordUsername: String(user.discordUsername || user.username || "Discord User").trim() || "Discord User",
    discordId,
    avatar: String(user.avatar || LOGO_ASSET).trim() || LOGO_ASSET,
    plan: String(user.plan || "free").trim() || "free",
    joinedAt: String(user.joinedAt || new Date().toISOString()).trim()
  };
}

async function fetchRemoteSession() {
  try {
    const response = await fetch(AUTH_SESSION_ENDPOINT, {
      cache: "no-store",
      credentials: "same-origin"
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload?.success || !payload?.authenticated) {
      return null;
    }

    return normalizeRemoteSession(payload);
  } catch {
    return null;
  }
}

async function requireSession() {
  const remoteSession = await fetchRemoteSession();
  if (remoteSession) {
    saveSession(remoteSession);
    return remoteSession;
  }

  clearSession();
  window.location.href = "login.html";
  return null;
}

async function syncSessionCacheForNav() {
  const remoteSession = await fetchRemoteSession();
  if (remoteSession) {
    saveSession(remoteSession);
  }
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

function buildMobileBottomNav() {
  if (document.querySelector("[data-mobile-bottom-nav]")) {
    return;
  }

  const session = getSession();
  const currentPage = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const accountHref = session ? "premium-dashboard.html" : "login.html";
  const accountLabel = session ? "Dashboard" : "Login";

  const items = [
    { href: "index.html", label: "Home", page: "index.html" },
    { href: "index.html#help", label: "Help", page: "index.html" },
    { href: "index.html#servers", label: "Servers", page: "index.html" },
    { href: "index.html#statistics", label: "Stats", page: "index.html" },
    { href: accountHref, label: accountLabel, page: accountHref.toLowerCase() }
  ];

  const nav = document.createElement("nav");
  nav.className = "mobile-bottom-nav";
  nav.setAttribute("data-mobile-bottom-nav", "1");
  nav.setAttribute("aria-label", "Mobile quick links");
  nav.innerHTML = items.map((item) => {
    const isActive = currentPage === item.page;
    return `<a href="${item.href}" class="${isActive ? "is-active" : ""}">${item.label}</a>`;
  }).join("");

  document.body.appendChild(nav);
  document.body.classList.add("mobile-nav-enabled");
}

function attachLogoutHandlers() {
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await fetch(AUTH_LOGOUT_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          }
        });
      } catch {
        // Proceed with local cleanup even if API call fails.
      }
      clearSession();
      window.location.href = "login.html";
    });
  });
}

function buildLoopedGifUrl() {
  const joiner = GIF_LOGO_ASSET.includes("?") ? "&" : "?";
  return `${GIF_LOGO_ASSET}${joiner}loop=${Date.now()}`;
}

function stopForcedGifLoop(imageNode) {
  const timerId = GIF_LOOP_TIMERS.get(imageNode);
  if (timerId) {
    clearInterval(timerId);
    GIF_LOOP_TIMERS.delete(imageNode);
  }
}

function startForcedGifLoop(imageNode) {
  stopForcedGifLoop(imageNode);

  const rawRefresh = Number(imageNode.getAttribute("data-gif-refresh-ms"));
  const refreshMs = Number.isFinite(rawRefresh) && rawRefresh >= GIF_MIN_LOOP_REFRESH_MS
    ? rawRefresh
    : DEFAULT_GIF_LOOP_REFRESH_MS;

  const timerId = setInterval(() => {
    if (document.hidden) {
      return;
    }
    imageNode.src = buildLoopedGifUrl();
  }, refreshMs);

  GIF_LOOP_TIMERS.set(imageNode, timerId);
}

function initGifLogoTargets() {
  document.querySelectorAll("[data-gif-logo]").forEach((imageNode) => {
    imageNode.classList.add("gif-live");
    imageNode.decoding = "async";
    imageNode.loading = "eager";
    imageNode.addEventListener("error", () => {
      stopForcedGifLoop(imageNode);
      imageNode.src = LOGO_ASSET;
    }, { once: true });
    imageNode.src = buildLoopedGifUrl();
    if (imageNode.hasAttribute("data-gif-force-loop")) {
      startForcedGifLoop(imageNode);
    }
  });
}

function getInitialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  let initials = (parts[0]?.[0] || "");
  if (parts.length > 1) {
    initials += (parts[1]?.[0] || "");
  }
  const clean = initials.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return clean || "SV";
}

function buildServerFallbackLogo(name) {
  const safeName = String(name || "Server");
  const initials = getInitialsFromName(safeName);
  let hash = 0;
  for (let i = 0; i < safeName.length; i += 1) {
    hash = ((hash << 5) - hash) + safeName.charCodeAt(i);
    hash |= 0;
  }
  const color = `#${(Math.abs(hash) % 0xffffff).toString(16).padStart(6, "0")}`;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="44" fill="${color}" />
  <text x="50%" y="57%" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="88" font-weight="700">${initials}</text>
</svg>`.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function sanitizeServers(servers) {
  const unique = new Map();
  for (const server of Array.isArray(servers) ? servers : []) {
    const guildId = String(server?.guildId || "").trim();
    const name = String(server?.name || "").trim();
    if (!name || /^unknown server$/i.test(name)) {
      continue;
    }
    const uniqueKey = guildId || name.toLowerCase();
    if (!unique.has(uniqueKey)) {
      unique.set(uniqueKey, server);
    }
  }
  return Array.from(unique.values());
}

function formatAddedOnDate(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return "--";
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getServerPageSize() {
  return window.matchMedia("(max-width: 720px)").matches
    ? SERVER_PAGE_SIZE_MOBILE
    : SERVER_PAGE_SIZE_DESKTOP;
}

function getServerPaginationNode() {
  return byId("server-pagination");
}

function hideServerPagination() {
  const paginationNode = getServerPaginationNode();
  if (!paginationNode) {
    return;
  }
  paginationNode.innerHTML = "";
  paginationNode.classList.add("hidden");
}

function renderServerPagination(totalPages, currentPage) {
  const paginationNode = getServerPaginationNode();
  if (!paginationNode) {
    return;
  }

  if (totalPages <= 1) {
    hideServerPagination();
    return;
  }

  const maxButtons = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  startPage = Math.max(1, endPage - maxButtons + 1);

  const numberButtons = [];
  if (startPage > 1) {
    numberButtons.push(`<button type="button" data-server-page="1">1</button>`);
    if (startPage > 2) {
      numberButtons.push(`<span class="server-page-dots">...</span>`);
    }
  }

  for (let page = startPage; page <= endPage; page += 1) {
    numberButtons.push(`
      <button
        type="button"
        data-server-page="${page}"
        class="${page === currentPage ? "is-active" : ""}"
      >${page}</button>
    `);
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      numberButtons.push(`<span class="server-page-dots">...</span>`);
    }
    numberButtons.push(`<button type="button" data-server-page="${totalPages}">${totalPages}</button>`);
  }

  paginationNode.innerHTML = `
    <button type="button" data-server-page="${Math.max(1, currentPage - 1)}" ${currentPage <= 1 ? "disabled" : ""}>&lt;</button>
    ${numberButtons.join("")}
    <button type="button" data-server-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage >= totalPages ? "disabled" : ""}>&gt;</button>
  `;
  paginationNode.classList.remove("hidden");

  paginationNode.querySelectorAll("button[data-server-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.getAttribute("data-server-page"));
      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > totalPages || nextPage === serverPaginationState.currentPage) {
        return;
      }

      serverPaginationState.currentPage = nextPage;
      renderServerCards(serverPaginationState.allServers);
      const serverSection = byId("servers");
      if (serverSection) {
        serverSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function renderUnavailableServerCard(message) {
  const wrapper = byId("server-list");
  if (!wrapper) {
    return;
  }
  serverPaginationState.allServers = [];
  serverPaginationState.currentPage = 1;
  hideServerPagination();

  wrapper.innerHTML = `
    <article class="server-card">
      <header class="server-top">
        <img src="${DEFAULT_SERVER_LOGO}" alt="Flute logo" class="server-logo">
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

  const safeServers = sanitizeServers(servers);
  serverPaginationState.allServers = safeServers;
  if (safeServers.length === 0) {
    renderUnavailableServerCard("Start the bot process to fetch active guild names and logos.");
    return;
  }

  const pageSize = getServerPageSize();
  const totalPages = Math.max(1, Math.ceil(safeServers.length / pageSize));
  if (serverPaginationState.currentPage > totalPages) {
    serverPaginationState.currentPage = totalPages;
  }
  if (serverPaginationState.currentPage < 1) {
    serverPaginationState.currentPage = 1;
  }

  const startIndex = (serverPaginationState.currentPage - 1) * pageSize;
  const pageServers = safeServers.slice(startIndex, startIndex + pageSize);

  wrapper.innerHTML = pageServers.map((server) => {
    const name = String(server?.name || "Server");
    const fallbackLogo = buildServerFallbackLogo(name);
    const logo = String(server?.logo || "").trim() || fallbackLogo;
    const status = String(server?.status || "Active");
    const addedOn = formatAddedOnDate(server?.addedAt);
    return `
    <article class="server-card">
      <header class="server-top">
        <img src="${logo}" data-fallback-logo="${fallbackLogo}" alt="${name} logo" class="server-logo">
        <div>
          <h3 class="server-name">${name}</h3>
          <p class="server-sub">${status} • Bot Added: ${addedOn}</p>
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
  `;
  }).join("");

  // If any server icon URL fails, fall back to default bot logo.
  wrapper.querySelectorAll(".server-logo").forEach((imageNode) => {
    imageNode.addEventListener("error", () => {
      const fallbackLogo = imageNode.getAttribute("data-fallback-logo") || DEFAULT_SERVER_LOGO;
      if (imageNode.dataset.fallbackApplied === "1") {
        return;
      }
      imageNode.dataset.fallbackApplied = "1";
      imageNode.src = fallbackLogo;
    }, { once: true });
  });

  renderServerPagination(totalPages, serverPaginationState.currentPage);
}

function bindServerPaginationResizeHandler() {
  if (hasBoundServerResizeHandler) {
    return;
  }
  hasBoundServerResizeHandler = true;

  window.addEventListener("resize", () => {
    if (!Array.isArray(serverPaginationState.allServers) || serverPaginationState.allServers.length === 0) {
      return;
    }

    clearTimeout(serverResizeTimerId);
    serverResizeTimerId = setTimeout(() => {
      const pageSize = getServerPageSize();
      const totalPages = Math.max(1, Math.ceil(serverPaginationState.allServers.length / pageSize));
      if (serverPaginationState.currentPage > totalPages) {
        serverPaginationState.currentPage = totalPages;
      }
      renderServerCards(serverPaginationState.allServers);
    }, 180);
  });
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
  try {
    const response = await fetch(`${LIVE_STATS_ENDPOINT}?trackViews=${trackViews ? 1 : 0}`, {
      cache: "no-store"
    });
    if (response.ok) {
      const payload = await response.json();
      if (payload?.success) {
        setCachedLiveStats(payload);
        return payload;
      }
    }
  } catch {
    // Try static snapshot fallback below.
  }

  const snapshotResponse = await fetch("live-server-stats.json", { cache: "no-store" });
  if (!snapshotResponse.ok) {
    throw new Error("Failed to fetch live server stats");
  }

  const snapshotPayload = await snapshotResponse.json();
  if (!snapshotPayload?.success) {
    throw new Error(snapshotPayload?.error || "Invalid live server payload");
  }

  setCachedLiveStats(snapshotPayload);
  return snapshotPayload;
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

function stopHomeStatsAutoRefresh() {
  if (homeStatsIntervalId) {
    clearInterval(homeStatsIntervalId);
    homeStatsIntervalId = null;
  }
}

function startHomeStatsAutoRefresh() {
  stopHomeStatsAutoRefresh();
  homeStatsIntervalId = window.setInterval(async () => {
    try {
      const livePayload = await fetchLiveServerStats({ trackViews: false });
      renderServerCards(livePayload.servers);
      applyPlatformStats(livePayload.platform);
    } catch {
      // Keep current UI if a refresh request fails.
    }
  }, HOME_STATS_REFRESH_MS);

  window.addEventListener("beforeunload", stopHomeStatsAutoRefresh, { once: true });
}

async function initHomePage() {
  try {
    const livePayload = await fetchLiveServerStats({ trackViews: true });
    renderServerCards(livePayload.servers);
    applyPlatformStats(livePayload.platform);
  } catch (error) {
    const cachedPayload = getCachedLiveStats();
    if (cachedPayload?.success) {
      renderServerCards(cachedPayload.servers);
      applyPlatformStats(cachedPayload.platform);
    } else {
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

  startHomeStatsAutoRefresh();
}

function getOAuthErrorMessage(reason) {
  const code = String(reason || "").trim().toLowerCase();
  if (!code) return "Discord login failed. Please try again.";
  if (code === "oauth_not_configured") return "Discord OAuth is not configured on server.";
  if (code === "invalid_or_expired_state") return "Login session expired. Start Discord login again.";
  if (code === "missing_code_or_state") return "Discord did not return login code. Try once more.";
  if (code === "oauth_callback_failed") return "Discord callback failed. Check OAuth credentials and redirect URI.";
  if (code === "oauth_start_failed") return "Unable to start Discord login flow right now.";
  return "Discord login failed. Please try again.";
}

async function initLoginPage() {
  const loginButton = byId("discord-login-btn");
  const statusNode = byId("oauth-status");
  const errorNode = byId("oauth-error");

  if (loginButton) {
    loginButton.addEventListener("click", () => {
      loginButton.disabled = true;
      loginButton.textContent = "Redirecting to Discord...";
      window.location.href = `${DISCORD_LOGIN_ENDPOINT}?redirect=premium-dashboard.html`;
    });
  }

  const params = new URLSearchParams(window.location.search);
  const authStatus = String(params.get("auth") || "").trim().toLowerCase();
  const reason = String(params.get("reason") || "").trim();

  if (authStatus === "failed" && errorNode) {
    errorNode.textContent = getOAuthErrorMessage(reason);
    errorNode.classList.remove("hidden");
  }

  const remoteSession = await fetchRemoteSession();
  if (remoteSession) {
    saveSession(remoteSession);
    window.location.href = "premium-dashboard.html";
    return;
  }

  clearSession();
  if (statusNode) {
    statusNode.classList.remove("hidden");
    statusNode.textContent = "Continue with Discord to access Dashboard, Profile and Manage Premiums.";
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
    node.src = session.avatar || LOGO_ASSET;
  });
}

async function initDashboardPage() {
  const session = await requireSession();
  if (!session) {
    return;
  }

  renderSessionInCommonPlaces(session);

  try {
    const livePayload = await fetchLiveServerStats({ trackViews: false });
    applyDashboardStats(livePayload.platform);
  } catch {
    const cachedPayload = getCachedLiveStats();
    if (cachedPayload?.success) {
      applyDashboardStats(cachedPayload.platform);
    } else {
      applyDashboardStats({
        totalSongsPlayed: 0,
        totalListeningHours: 0,
        activeServers: 0,
        liveServers: 0
      });
    }
  }
}

async function initProfilePage() {
  const session = await requireSession();
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
  if (idInput) idInput.setAttribute("readonly", "readonly");
  if (planInput) planInput.setAttribute("disabled", "disabled");

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextSession = {
      ...session,
      username: String(nameInput?.value || "").trim() || session.username,
      discordId: session.discordId,
      avatar: String(avatarInput?.value || "").trim() || LOGO_ASSET,
      plan: session.plan
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
  const session = await requireSession();
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
      const targetPlan = String(selectedPlan || "monthly").trim().toLowerCase();
      window.location.href = `premium.html?plan=${encodeURIComponent(targetPlan)}`;
    });
  });
}

async function initPage() {
  initGifLogoTargets();
  attachNavToggle();
  bindServerPaginationResizeHandler();
  attachLogoutHandlers();

  const page = document.body.getAttribute("data-page");
  if (!page) {
    return;
  }

  if (page === "home") await initHomePage();
  if (page === "login") await initLoginPage();
  if (page === "dashboard") await initDashboardPage();
  if (page === "profile") await initProfilePage();
  if (page === "manage-premiums") await initManagePremiumPage();

  await syncSessionCacheForNav();
  buildMobileBottomNav();
}

document.addEventListener("DOMContentLoaded", () => {
  initPage().catch((error) => {
    console.error("Page initialization failed:", error?.message || error);
  });
});
