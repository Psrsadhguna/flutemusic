const axios = require("axios");

const captionCache = new Map();
const MAX_CACHE_ITEMS = 250;
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_CACHE_MINUTES = 60;

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function isEnabled() {
    const raw = String(process.env.AUTO_TRANSLATION_CAPTIONS || "").trim().toLowerCase();
    if (!raw) return true;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function getTargetLanguage() {
    const raw = String(
        process.env.AUTO_CAPTION_TARGET_LANG ||
        process.env.CAPTION_TARGET_LANG ||
        "en"
    ).trim().toLowerCase();

    return /^[a-z]{2,5}$/.test(raw) ? raw : "en";
}

function getSourceLanguage() {
    const raw = String(
        process.env.AUTO_CAPTION_SOURCE_LANG ||
        process.env.CAPTION_SOURCE_LANG ||
        "auto"
    ).trim().toLowerCase();

    if (raw === "auto") return "auto";
    return /^[a-z]{2,5}$/.test(raw) ? raw : "auto";
}

function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function cleanupCache() {
    const now = Date.now();
    for (const [key, cached] of captionCache.entries()) {
        if (!cached || cached.expiresAt <= now) {
            captionCache.delete(key);
        }
    }

    if (captionCache.size <= MAX_CACHE_ITEMS) return;
    const keys = Array.from(captionCache.keys());
    const overflow = captionCache.size - MAX_CACHE_ITEMS;
    for (let i = 0; i < overflow; i += 1) {
        captionCache.delete(keys[i]);
    }
}

async function translateText(text, sourceLang, targetLang) {
    const normalized = normalizeText(text);
    if (!normalized) return null;
    if (sourceLang === targetLang) return normalized;

    cleanupCache();

    const cacheKey = `${sourceLang}:${targetLang}:${normalized.toLowerCase()}`;
    const cached = captionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const timeoutMs = parsePositiveInt(process.env.AUTO_CAPTION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    const cacheMinutes = parsePositiveInt(process.env.AUTO_CAPTION_CACHE_MINUTES, DEFAULT_CACHE_MINUTES);

    const response = await axios.get("https://translate.googleapis.com/translate_a/single", {
        params: {
            client: "gtx",
            sl: sourceLang,
            tl: targetLang,
            dt: "t",
            q: normalized.slice(0, 260)
        },
        timeout: timeoutMs
    });

    const segments = Array.isArray(response.data?.[0]) ? response.data[0] : [];
    const translated = normalizeText(
        segments
            .map((segment) => (Array.isArray(segment) ? String(segment[0] || "") : ""))
            .join(" ")
    );

    if (!translated) return null;

    captionCache.set(cacheKey, {
        value: translated,
        expiresAt: Date.now() + cacheMinutes * 60 * 1000
    });

    return translated;
}

function getTrackTitle(track) {
    if (!track || !track.info) return "";
    return normalizeText(track.info.title || "");
}

async function buildTrackCaption(track) {
    if (!isEnabled()) return null;

    const title = getTrackTitle(track);
    if (!title) return null;

    const sourceLang = getSourceLanguage();
    const targetLang = getTargetLanguage();

    const translated = await translateText(title, sourceLang, targetLang);
    if (!translated) return null;

    if (normalizeForCompare(title) === normalizeForCompare(translated)) {
        return null;
    }

    return {
        text: translated.slice(0, 220),
        targetLang: targetLang.toUpperCase(),
        sourceText: title
    };
}

module.exports = {
    buildTrackCaption,
    getTargetLanguage,
    isEnabled
};
