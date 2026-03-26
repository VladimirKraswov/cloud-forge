import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./db.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT,
      command TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      token TEXT PRIMARY KEY,
      job_id TEXT,
      used INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT,
      message TEXT
    )
  `);
});

export default db;