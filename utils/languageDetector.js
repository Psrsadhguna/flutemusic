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
            keywords: /\btelugu\b|andhra|telangana/i,
            exclude: /\bbollywood\b|hindi\s+remix|non-stop.*hindi|hindi.*non-stop/i
        },
        hindi: {
            script: /[\u0900-\u097F]/,
            keywords: /\bhindi\b|bollywood|hindi remix|non-stop.*remix/i,
            exclude: null
        },
        tamil: {
            script: /[\u0B80-\u0BFF]/,
            keywords: /\btamil\b|tamilnadu|gana|tamizhisai/i,
            exclude: /\bbollywood\b|hindi\s+remix|non-stop.*hindi|hindi.*non-stop/i
        },
        kannada: {
            script: /[\u0C80-\u0CFF]/,
            keywords: /\bkannada\b|karnataka|kannada remix/i,
            exclude: /\bbollywood\b|hindi\s+remix|non-stop.*hindi|hindi.*non-stop/i
        },
        malayalam: {
            script: /[\u0D00-\u0D7F]/,
            keywords: /\bmalayalam\b|kerala|mallu/i,
            exclude: /\bbollywood\b|hindi\s+remix|non-stop.*hindi|hindi.*non-stop/i
        },
        marathi: {
            script: /[\u0900-\u097F]/,
            keywords: /\bmarathi\b|maharashtra/i,
            exclude: null
        },
        gujarati: {
            script: /[\u0A80-\u0AFF]/,
            keywords: /\bgujarati\b|gujarat/i,
            exclude: /\bbollywood\b|hindi\s+remix|non-stop.*hindi|hindi.*non-stop/i
        }
    };

    const pattern = languagePatterns[detectedLang];
    if (!pattern) return true; // Default to true if unknown language

    // PRIORITY 1: If title contains the language keyword, ALWAYS accept it
    if (pattern.keywords.test(combined)) {
        return true;
    }

    // PRIORITY 2: If title contains the script of the language, accept it
    if (pattern.script.test(combined)) {
        return true;
    }

    // PRIORITY 3: Reject obvious wrong-language songs (Bollywood/Hindi when searching for regional)
    if (pattern.exclude && pattern.exclude.test(combined)) {
        // But only reject if it has NO target language indicator at all
        if (!pattern.script.test(combined) && !pattern.keywords.test(combined)) {
            return false;
        }
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

    // STRATEGY 1: Find songs with language keyword
    const langKeyword = detectedLang === 'telugu' ? 'telugu|andhra|telangana' 
                      : detectedLang === 'tamil' ? 'tamil|tamilnadu|gana'
                      : detectedLang === 'kannada' ? 'kannada|karnataka'
                      : detectedLang === 'malayalam' ? 'malayalam|kerala|mallu'
                      : detectedLang === 'hindi' ? 'hindi|bolly'
                      : detectedLang === 'marathi' ? 'marathi|maharashtra'
                      : detectedLang === 'gujarati' ? 'gujarati|gujrat'
                      : null;

    if (langKeyword) {
        const keywordMatches = tracks.filter(track => {
            const title = (track.info.title || '').toLowerCase();
            const artist = (track.info.author || '').toLowerCase();
            const regex = new RegExp(langKeyword, 'i');
            return regex.test(title) || regex.test(artist);
        });

        // If we found keyword matches, prefer them but also include some script matches
        if (keywordMatches.length > 0) {
            console.log(`🔍 Language: "${detectedLang}" detected from "${query}"`);
            console.log(`   ✅ Found ${keywordMatches.length} songs with language keyword`);
            return keywordMatches;
        }
    }

    // STRATEGY 2: Find songs with language script characters
    const scriptPattern = {
        telugu: /[\u0C00-\u0C7F]/,
        hindi: /[\u0900-\u097F]/,
        tamil: /[\u0B80-\u0BFF]/,
        kannada: /[\u0C80-\u0CFF]/,
        malayalam: /[\u0D00-\u0D7F]/,
        marathi: /[\u0900-\u097F]/,
        gujarati: /[\u0A80-\u0AFF]/
    };

    if (scriptPattern[detectedLang]) {
        const scriptMatches = tracks.filter(track => {
            const title = (track.info.title || '').toLowerCase();
            const artist = (track.info.author || '').toLowerCase();
            const combined = `${title} ${artist}`;
            return scriptPattern[detectedLang].test(combined);
        });

        if (scriptMatches.length > 0) {
            console.log(`🔍 Language: "${detectedLang}" detected from "${query}"`);
            console.log(`   ✅ Found ${scriptMatches.length} songs with language script`);
            return scriptMatches;
        }
    }

    // FALLBACK: Return all tracks if no language matches
    console.log(`🔍 Language: "${detectedLang}" detected, but no specific matches found`);
    console.log(`   ⚠️ Returning all results`);
    return tracks;
}

module.exports = {
    detectLanguage,
    matchesLanguage,
    filterByLanguage
};
