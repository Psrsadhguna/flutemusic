const db = require("./premiumDB");
const { syncPremiumRoleForUser } =
require("./premiumRoleSync");

function startPremiumExpiryChecker(client){

 setInterval(()=>{

   db.all(
     "SELECT * FROM premium_users WHERE expiry < ?",
     [Date.now()],
     async (err,rows)=>{

        if(!rows) return;

        for(const user of rows){

           await syncPremiumRoleForUser(
             client,
             user.userId,
             false
           );

           db.run(
             "DELETE FROM premium_users WHERE userId=?",
             [user.userId]
           );

           console.log(`❌ Premium expired ${user.userId}`);
        }
     }
   );

 },60000);
}

module.exports={ startPremiumExpiryChecker };