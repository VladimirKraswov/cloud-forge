import sqlite3 from 'sqlite3';
import { config } from '../utils/config';

const db = new sqlite3.Database(config.databaseUrl);

export const initDb = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          status TEXT,
          command TEXT,
          result TEXT,
          metrics TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
        (err) => {
          if (err) return reject(err);
        },
      );

      db.run(
        `
        CREATE TABLE IF NOT EXISTS tokens (
          token TEXT PRIMARY KEY,
          job_id TEXT,
          used INTEGER DEFAULT 0
        )
      `,
        (err) => {
          if (err) return reject(err);
        },
      );

      db.run(
        `
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT,
          message TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
        (err) => {
          if (err) return reject(err);
          resolve();
        },
      );
    });
  });
};

export default db;
