require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const db = require("../premium/premiumDB");
const { syncPremiumRoleForUser } =
require("../premium/premiumRoleSync");

const router = express.Router();

router.use(express.json({
  verify:(req,res,buf)=> req.rawBody = buf
}));

router.post("/razorpay", async (req,res)=>{

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("hex");

  if(expected !== req.headers["x-razorpay-signature"])
      return res.sendStatus(400);

  const event = req.body.event;

  if(event === "payment.captured"){

      const payment = req.body.payload.payment.entity;
      const userId = payment.notes?.discord_id;

      if(!userId) return res.sendStatus(200);

      const expiry =
        Date.now() + 30*24*60*60*1000;

      db.run(
        `INSERT OR REPLACE INTO premium_users VALUES (?,?)`,
        [userId, expiry],
        async ()=>{

          console.log(`⭐ Premium activated ${userId}`);

          await syncPremiumRoleForUser(
            global.discordClient,
            userId,
            true
          );
        }
      );
  }

  res.sendStatus(200);
});

module.exports = router;