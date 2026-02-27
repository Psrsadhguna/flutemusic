const { EmbedBuilder } = require('discord.js');
const paymentUtils = require('../utils/paymentUtils');

module.exports = {
  name: "premium",
  description: "Check premium status and features",
  
  execute(message, args) {
    const userId = message.author.id;
    const isPremium = paymentUtils.isPremium(userId);
    const premiumUser = paymentUtils.getPremiumUser(userId);

    const webURL = process.env.WEBSITE_URL || 'https://rzp.io/rzp/uZFgBFL';

    const embed = new EmbedBuilder()
      .setTitle('💎 Flute Music Premium')
      .setColor(isPremium ? '#FFD700' : '#808080')
      .setThumbnail(message.author.displayAvatarURL())
      .setDescription(isPremium ? '✅ You have premium access!' : '❌ You don\'t have premium access yet');

    if (isPremium && premiumUser) {
      const statusText = premiumUser.plan === 'lifetime' ? '🌟 Lifetime' : '📅 Monthly';
      const expiry = premiumUser.expiresAt 
        ? new Date(premiumUser.expiresAt).toLocaleDateString() 
        : 'Never';

      embed.addFields(
        { name: 'Plan Type', value: statusText, inline: true },
        { name: 'Expiration', value: expiry, inline: true },
        { name: 'Purchased', value: new Date(premiumUser.purchasedAt).toLocaleDateString(), inline: true },
        { name: '✔️ Unlocked Features:', value: 
          '• 50+ Audio Filters\n' +
          '• Advanced Effects\n' +
          '• Premium Audio Quality\n' +
          '• Priority Support'
        }
      );
    } else {
      embed.addFields(
        { name: 'Monthly Premium - ₹50', value: '1 month of all features' },
        { name: '🔗 Purchase', value: `[Click here to buy premium](${webURL})` }
      );
    }

    message.reply({ embeds: [embed] });
  }
};