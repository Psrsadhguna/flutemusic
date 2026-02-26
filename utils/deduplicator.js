/**
 * Remove duplicate or near-duplicate songs from search results
 * Compares song titles to find duplicates with slight variations
 */

/**
 * Normalize a track title for comparison (remove extra spaces, punctuation, etc.)
 * @param {string} title - Track title
 * @returns {string} - Normalized title
 */
function normalizeTitle(title) {
    if (!title) return '';
    
    return title
        .toLowerCase()
        .replace(/\(official[^)]*\)/gi, '')
        .replace(/\(lyrics[^)]*\)/gi, '')
        .replace(/\(lyric[^)]*\)/gi, '')
        .replace(/\(audio[^)]*\)/gi, '')
        .replace(/\(hd[^)]*\)/gi, '')
        .replace(/\(hq[^)]*\)/gi, '')
        .replace(/\(full\)/gi, '')
        .replace(/\(cover[^)]*\)/gi, '')
        .replace(/\(remix[^)]*\)/gi, '')
        .replace(/\(extended[^)]*\)/gi, '')
        .replace(/\[official[^\]]*\]/gi, '')
        .replace(/\[lyrics[^\]]*\]/gi, '')
        .replace(/\[audio[^\]]*\]/gi, '')
        .replace(/\[hd[^\]]*\]/gi, '')
        .replace(/\[cover[^\]]*\]/gi, '')
        .replace(/\[remix[^\]]*\]/gi, '')
        .replace(/\[extended[^\]]*\]/gi, '')
        .replace(/[\s\-_:\.]+/g, ' ') // Normalize separators
        .trim();
}

/**
 * Calculate similarity between two strings (Levenshtein-like)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0-1, where 1 is identical)
 */
function calculateSimilarity(str1, str2) {
    const s1 = normalizeTitle(str1);
    const s2 = normalizeTitle(str2);
    
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;
    
    // Simple approach: check if one contains the other (for songs with extra info)
    if (s1.includes(s2) || s2.includes(s1)) return 0.95;
    
    // Check how many words match
    const words1 = s1.split(' ');
    const words2 = s2.split(' ');
    
    const commonWords = words1.filter(w => words2.includes(w)).length;
    const totalWords = Math.max(words1.length, words2.length);
    
    return commonWords / totalWords;
}

/**
 * Remove duplicate or near-duplicate tracks from results
 * @param {array} tracks - Array of track objects
 * @param {number} threshold - Similarity threshold (0-1, default 0.75)
 * @returns {array} - Deduplicated tracks
 */
function deduplicateTracks(tracks, threshold = 0.75) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return tracks;
    }

    const seen = [];
    const result = [];
    const duplicates = [];

    for (const track of tracks) {
        if (!track || !track.info) continue;

        const trackTitle = normalizeTitle(track.info.title || '');
        const trackArtist = normalizeTitle(track.info.author || '');
        
        let isDuplicate = false;
        let duplicateOf = null;

        // Check against all previously seen tracks
        for (let i = 0; i < seen.length; i++) {
            const seenTitle = seen[i].title;
            const seenArtist = seen[i].artist;
            
            // Compare title
            const titleSimilarity = calculateSimilarity(trackTitle, seenTitle);
            
            // If titles are very similar, it's a duplicate
            if (titleSimilarity >= threshold) {
                isDuplicate = true;
                duplicateOf = seenTitle;
                break;
            }
            
            // Also check if artist+title combo is duplicate (for remix versions)
            if (seenArtist && trackArtist) {
                const fullSimilarity = calculateSimilarity(
                    `${trackArtist} ${trackTitle}`,
                    `${seenArtist} ${seenTitle}`
                );
                if (fullSimilarity >= 0.85) {
                    isDuplicate = true;
                    duplicateOf = `${seenArtist} - ${seenTitle}`;
                    break;
                }
            }
        }

        if (!isDuplicate) {
            seen.push({ 
                title: trackTitle, 
                artist: trackArtist,
                fullTitle: track.info.title
            });
            result.push(track);
        } else {
            duplicates.push({ original: duplicateOf, duplicate: track.info.title });
        }
    }

    if (duplicates.length > 0) {
        console.log(`🧹 Deduplicated: Removed ${duplicates.length} duplicate(s)`);
        duplicates.slice(0, 3).forEach(d => {
            console.log(`   ❌ Duplicate of "${d.original}"`);
            console.log(`      ${d.duplicate.substring(0, 60)}`);
        });
    }

    return result;
}

module.exports = {
    deduplicateTracks,
    normalizeTitle,
    calculateSimilarity
};
