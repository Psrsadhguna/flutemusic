function createProgressBar(position, length, isStream) {
    try {
        if (!position || !length || isStream) return '';
        position = Number(position);
        length = Number(length);
        if (!isFinite(position) || !isFinite(length) || length <= 0) return '';
        const barLength = 15;
        let progress = position / length;
        progress = Math.max(0, Math.min(1, progress));
        const filledLength = Math.round(progress * barLength);
        const emptyLength = Math.max(0, barLength - filledLength);
        const filled = '<a:green_fm:1476445115005534230>'.repeat(filledLength);
        const empty = '<a:red_fm:1476444450258682131>'.repeat(emptyLength);
        const percentage = Math.round(progress * 100);
        return `${filled}${empty} **${percentage}%**`;
    } catch {
        return '';
    }
}

console.log(createProgressBar(12,240,false));
