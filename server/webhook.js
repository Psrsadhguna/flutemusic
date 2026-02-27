const express = require("express");
const router = express.Router();

const {
    getDB,
    saveDB,
    syncPremiumRoleForUser
} = require("../premium/syncPremiumRole");

router.post("/", express.json(), async (req, res) => {

    console.log("Webhook received");

    const event = req.body.event;
    console.log("Event:", event);

    if (event !== "payment.captured") return res.sendStatus(200);

    const payment = req.body.payload.payment.entity;

    const discordId = payment.notes?.discord_id;

    if (!discordId) {
        console.log("❌ No discord_id in payment notes");
        return res.sendStatus(200);
    }

    const client = global.discordClient;

    const db = getDB();

    // ⭐ 30 days premium
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

    db[discordId] = { expiresAt };

    saveDB(db);

    await syncPremiumRoleForUser(client, discordId, true);

    console.log("⭐ Premium activated for", discordId);

    res.sendStatus(200);
});

module.exports = router;