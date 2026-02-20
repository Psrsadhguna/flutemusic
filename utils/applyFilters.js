module.exports = async (player, guildId) => {
    const f = player.filters || {};

    await player.node.rest.updatePlayer({
        guildId,
        data: {
            filters: {
                equalizer: f.equalizer || [],
                timescale: f.timescale || {},
                tremolo: f.tremolo || {},
                vibrato: f.vibrato || {},
                rotation: f.rotation || {},
                karaoke: f.karaoke || {},
                distortion: f.distortion || {},
                channelMix: f.channelMix || {}
            }
        }
    });
};
