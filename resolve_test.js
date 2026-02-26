const { Riffy } = require('riffy');
const config = require('./config');
const client = {guilds:{cache:new Map()}, shard:{send:()=>{}}, user:{id:'0'}};
client.riffy = new Riffy(client, config.nodes, {send:()=>{}, defaultSearchPlatform:'ytmsearch',restVersion:'v4',plugins:[]});
(async () => {
  try {
    await client.riffy.init('0');
    const url='https://youtu.be/qrCao5Hn6nY';
    console.log('resolving',url);
    const result = await client.riffy.resolve({query:url, requester:{tag:'test#0000'}});
    console.log(result);
  } catch(e){console.error(e);}  
  process.exit();
})();
