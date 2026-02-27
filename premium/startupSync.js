const db = require("./premiumDB");
const { syncPremiumRoleForUser } =
require("./premiumRoleSync");

async function startupPremiumSync(client){

 db.all(
   "SELECT * FROM premium_users",
   [],
   async (err,rows)=>{

     if(!rows) return;

     for(const user of rows){

        const active = user.expiry > Date.now();

        await syncPremiumRoleForUser(
          client,
          user.userId,
          active
        );
     }

     console.log("✅ Premium startup sync done");
   }
 );
}

module.exports = { startupPremiumSync };