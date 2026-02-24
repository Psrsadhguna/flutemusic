module.exports = (title = '') => {
    const t = String(title).toLowerCase();
    const res = {
        slowmode: false,
        echo: false
    };

    if (t.includes('slowed') || t.includes('slow') || t.includes('slow-mode') || t.includes('slow mode') || t.includes('(slowed') ) {
        res.slowmode = true;
    }

    // Map 'reverb' tag to the bot's echo/soft EQ preset (there's no native reverb filter)
    if (t.includes('reverb') || t.includes('rev') || t.includes('+reverb') || t.includes(' + reverb')) {
        res.echo = true;
    }

    return res;
};
