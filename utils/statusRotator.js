const { ActivityType } = require('discord.js');

module.exports = {
    initializeStatusRotator: (client) => {
        let statusIndex = 0;
        
        const getServerCount = async () => {
            try {
                // If the bot is sharded, fetch counts from all shards and sum
                if (client.shard && client.shard.fetchClientValues) {
                    const counts = await client.shard.fetchClientValues('guilds.cache.size');
                    if (Array.isArray(counts)) return counts.reduce((a, b) => a + (Number(b) || 0), 0);
                }
                // Fallback to local cache
                return client.guilds.cache.size || 0;
            } catch (e) {
                console.error('StatusRotator getServerCount error:', e && e.message ? e.message : e);
                return client.guilds.cache.size || 0;
            }
        };

        const buildStatuses = async () => {
            const serverCount = await getServerCount();
            return [
                { name: 'fhelp | flute music', type: ActivityType.Playing },
                { name: `🎶 Music | ${serverCount} servers`, type: ActivityType.Playing },
                { name: 'Music Streaming | Fast & Reliable', type: ActivityType.Playing }
            ];
        };

        const updateStatus = async () => {
            try {
                const statuses = await buildStatuses();
                const status = statuses[statusIndex];

                if (!client.user) {
                    console.log('StatusRotator: client.user not available yet');
                    return;
                }

                await client.user.setActivity(status.name, { type: status.type });

                // Debug logging to help verify updates
                try {
                    const serverCount = await getServerCount();
                    console.log(`StatusRotator: set status -> "${status.name}" (index ${statusIndex}) | servers=${serverCount}`);
                } catch (e) {
                    console.log(`StatusRotator: set status -> "${status.name}" (index ${statusIndex})`);
                }

                statusIndex = (statusIndex + 1) % statuses.length;
            } catch (error) {
                console.error('Error updating status:', error && error.message ? error.message : error);
            }
        };

        // Update status every 30 seconds
        updateStatus(); // Set initial status immediately
        const statusInterval = setInterval(updateStatus, 30000);
        
        return statusInterval;
    }
};
