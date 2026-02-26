const { createCanvas, loadImage } = require("canvas");

async function getDominantColor(imageUrl) {
    try {
        if (!imageUrl) return 0x2f3136;

        // dynamically import fetch (node-fetch v3 is ESM-only)
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(imageUrl);
        const buffer = await res.buffer();

        const img = await loadImage(buffer);

        const canvas = createCanvas(40, 40);
        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0, 40, 40);

        const data = ctx.getImageData(0, 0, 40, 40).data;

        let r = 0, g = 0, b = 0, count = 0;

        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
        }

        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        return (r << 16) + (g << 8) + b;

    } catch {
        return 0x2f3136;
    }
}

module.exports = getDominantColor;