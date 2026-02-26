// Language detection utility for filtering search results by language

/**
 * Detect the language of a search query based on script/characters used
 * @param {string} query - The search query
 * @returns {string} - Detected language code: 'telugu', 'hindi', 'tamil', 'kannada', 'english', etc.
 */
function detectLanguage(query) {
    if (!query) return 'english';

    const text = query.toLowerCase();

    // Telugu script (U+0C00 to U+0C7F)
    if (/[\u0C00-\u0C7F]/.test(text)) {
        return 'telugu';
    }

    // Hindi/Devanagari script (U+0900 to U+097F)
    if (/[\u0900-\u097F]/.test(text)) {
        return 'hindi';
    }

    // Tamil script (U+0B80 to U+0BFF)
    if (/[\u0B80-\u0BFF]/.test(text)) {
        return 'tamil';
    }

    // Kannada script (U+0C80 to U+0CFF)
    if (/[\u0C80-\u0CFF]/.test(text)) {
        return 'kannada';
    }

    // Malayalam script (U+0D00 to U+0D7F)
    if (/[\u0D00-\u0D7F]/.test(text)) {
        return 'malayalam';
    }

    // Marathi script (Devanagari, same as Hindi)
    if (/marathi/i.test(text)) {
        return 'marathi';
    }

    // Gujarati script (U+0A80 to U+0AFF)
    if (/[\u0A80-\u0AFF]/.test(text)) {
        return 'gujarati';
    }

    return 'english';
}

/**
 * Check if a track title/artist matches the detected language
 * @param {object} track - Track object with info
 * @param {string} detectedLang - Detected language from query
 * @returns {boolean} - True if track likely matches the language
 */
function matchesLanguage(track, detectedLang) {
    if (!track || !track.info) return false;

    const title = (track.info.title || '').toLowerCase();
    const artist = (track.info.author || '').toLowerCase();
    const combined = `${title} ${artist}`;

    // Map language codes to their script ranges
    const scriptRanges = {
        telugu: /[\u0C00-\u0C7F]/,
        hindi: /[\u0900-\u097F]/,
        tamil: /[\u0B80-\u0BFF]/,
        kannada: /[\u0C80-\u0CFF]/,
        malayalam: /[\u0D00-\u0D7F]/,
        marathi: /[\u0900-\u097F]/,
        gujarati: /[\u0A80-\u0AFF]/,
        english: /[a-z]/
    };

    const scriptPattern = scriptRanges[detectedLang];
    if (!scriptPattern) return true; // Default to true if unknown language

    // Check if the track contains the script of the detected language
    return scriptPattern.test(combined);
}

/**
 * Filter search results to match the detected language
 * @param {array} tracks - Array of track objects
 * @param {string} detectedLang - Detected language from query
 * @returns {array} - Filtered tracks matching the language
 */
function filterByLanguage(tracks, detectedLang) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return tracks;
    }

    // If English, don't filter (accept all)
    if (detectedLang === 'english') {
        return tracks;
    }

    // Filter tracks that match the detected language
    const matched = tracks.filter(track => matchesLanguage(track, detectedLang));

    // If we found matches, return them; otherwise return all (fallback)
    return matched.length > 0 ? matched : tracks;
}

module.exports = {
    detectLanguage,
    matchesLanguage,
    filterByLanguage
};
