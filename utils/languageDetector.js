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

    // Check for language keywords in text (for mixed queries like "dj song in telugu")
    if (/telugu|తెలుగు/.test(text)) return 'telugu';
    if (/hindi|हिंदी/.test(text)) return 'hindi';
    if (/tamil|தமிழ்/.test(text)) return 'tamil';
    if (/kannada|ಕನ್ನಡ/.test(text)) return 'kannada';
    if (/malayalam|മലയാളം/.test(text)) return 'malayalam';
    if (/marathi|मराठी/.test(text)) return 'marathi';
    if (/gujarati|ગુજરાતી/.test(text)) return 'gujarati';

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

    // Map language codes to their script ranges AND keyword patterns
    const languagePatterns = {
        telugu: {
            script: /[\u0C00-\u0C7F]/,
            keywords: /\btelugu\b|andhra|telangana/i
        },
        hindi: {
            script: /[\u0900-\u097F]/,
            keywords: /\bhindi\b|bollywood|hindi remix|non-stop.*hindi/i
        },
        tamil: {
            script: /[\u0B80-\u0BFF]/,
            keywords: /\btamil\b|tamilnadu|gana|tamizhisai/i
        },
        kannada: {
            script: /[\u0C80-\u0CFF]/,
            keywords: /\bkannada\b|karnataka|kannada remix/i
        },
        malayalam: {
            script: /[\u0D00-\u0D7F]/,
            keywords: /\bmalayalam\b|kerala|mallu/i
        },
        marathi: {
            script: /[\u0900-\u097F]/,
            keywords: /\bmarathi\b|maharashtra/i
        },
        gujarati: {
            script: /[\u0A80-\u0AFF]/,
            keywords: /\bgujarati\b|gujarat/i
        }
    };

    const pattern = languagePatterns[detectedLang];
    if (!pattern) return true; // Default to true if unknown language

    // Check if the track contains the script of the detected language
    if (pattern.script.test(combined)) {
        return true;
    }

    // Check if the track contains language keywords
    if (pattern.keywords.test(combined)) {
        return true;
    }

    return false;
}

/**
 * Filter search results to match the detected language
 * @param {array} tracks - Array of track objects
 * @param {string} detectedLang - Detected language from query
 * @param {string} query - Original search query for context
 * @returns {array} - Filtered tracks matching the language
 */
function filterByLanguage(tracks, detectedLang, query) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return tracks;
    }

    // If English, don't filter (accept all)
    if (detectedLang === 'english') {
        return tracks;
    }

    // Filter tracks that match the detected language
    const matched = tracks.filter(track => matchesLanguage(track, detectedLang));

    console.log(`🔍 Language Filter: Detected "${detectedLang}" from query "${query}"`);
    console.log(`   Found ${matched.length} matching tracks out of ${tracks.length}`);
    
    if (matched.length > 0) {
        matched.forEach((track, i) => {
            console.log(`   ✓ ${i + 1}. ${track.info.title.substring(0, 50)}`);
        });
        return matched;
    }

    // If no matches found, log all results for debugging
    console.log(`⚠️ No ${detectedLang} language results found for "${query}"`);
    console.log(`   Available results:`);
    tracks.slice(0, 3).forEach((track, i) => {
        console.log(`   ${i + 1}. ${track.info.title.substring(0, 50)}`);
    });
    
    return tracks;
}

module.exports = {
    detectLanguage,
    matchesLanguage,
    filterByLanguage
};
