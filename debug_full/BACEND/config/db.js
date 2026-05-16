const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log(`Connected to SQLite database at ${dbPath}`);
  }
});

// Keep the app responsive while background question-preparation jobs are writing.
// WAL allows normal reads (login/profile/latest result) to continue while writes happen,
// and busy_timeout prevents SQLite from failing immediately during short write locks.
db.configure('busyTimeout', Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 10000));

db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run(`PRAGMA busy_timeout = ${Number(process.env.SQLITE_BUSY_TIMEOUT_MS || 10000)}`);
});

module.exports = db;
