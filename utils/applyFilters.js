function hasOwn(source, key) {
    return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeObjectFilter(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    if (Object.keys(value).length === 0) {
        return null;
    }
    return value;
}

function normalizeEqualizerBands(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return [];
    }

    return value
        .map((band) => {
            const bandIndex = Number(band?.band);
            const gainValue = Number(band?.gain);

            if (!Number.isFinite(bandIndex) || !Number.isFinite(gainValue)) {
                return null;
            }

            return {
                band: Math.max(0, Math.min(14, Math.trunc(bandIndex))),
                gain: Math.max(-0.25, Math.min(1, gainValue))
            };
        })
        .filter(Boolean);
}

module.exports = async (player, guildId) => {
    const f = player.filters || {};
    const filters = {};

    if (hasOwn(f, "equalizer")) {
        filters.equalizer = normalizeEqualizerBands(f.equalizer);
    }

    const objectFilterKeys = ["timescale", "tremolo", "vibrato", "rotation", "karaoke"];
    for (const key of objectFilterKeys) {
        if (hasOwn(f, key)) {
            filters[key] = normalizeObjectFilter(f[key]);
        }
    }

    await player.node.rest.updatePlayer({
        guildId,
        data: { filters }
    });
};
