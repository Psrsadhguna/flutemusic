const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./premium.sqlite");

db.run(`
CREATE TABLE IF NOT EXISTS premium_users (
  userId TEXT PRIMARY KEY,
  expiry INTEGER
)
`);

module.exports = db;