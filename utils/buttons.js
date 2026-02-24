const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Validate if a string is a valid URL
 */
function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Create a button with URL validation
 * Returns null if URL is invalid
 */
function createButton(label, url, emoji = null, style = ButtonStyle.Link) {
    if (!url || !isValidURL(url)) {
        return null;
    }
    
    const button = new ButtonBuilder()
        .setLabel(label)
        .setStyle(style)
        .setURL(url);
    
    if (emoji) {
        button.setEmoji(emoji);
    }
    
    return button;
}

/**
 * Create action row with buttons, filtering out invalid ones
 * Returns null if no valid buttons
 */
function createButtonRow(...buttonConfigs) {
    const buttons = buttonConfigs
        .map(config => createButton(config.label, config.url, config.emoji, config.style))
        .filter(btn => btn !== null);
    
    if (buttons.length === 0) {
        return null;
    }
    
    return new ActionRowBuilder().addComponents(...buttons);
}

/**
 * Create help command buttons from config
 */
function createHelpCommandButtons(config) {
    return createButtonRow(
        {
            label: 'Support',
            url: config.supportURL || 'https://discord.gg/A5R9HWGkfF',
            emoji: '🔗',
            style: ButtonStyle.Link
        },
        {
            label: 'Vote',
            url: config.voteURL,
            emoji: '⭐',
            style: ButtonStyle.Link
        },
        {
            label: 'Website',
            url: config.websiteURL,
            emoji: '🌐',
            style: ButtonStyle.Link
        }
    );
}

module.exports = {
    isValidURL,
    createButton,
    createButtonRow,
    createHelpCommandButtons
};
