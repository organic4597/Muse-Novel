import fs from 'node:fs';
import path from 'node:path';

import * as schema from './schema';

const DEFAULT_SQLITE_PATH = 'data/sqlite.db';

function prepareSqlitePath(databasePath: string): void {
  if (databasePath === ':memory:' || databasePath.startsWith('file:')) {
    return;
  }

  fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
}

function createDb() {
  const provider = process.env.DATABASE_PROVIDER || 'sqlite';
  
  if (provider === 'turso') {
    // Dynamic import is NOT needed — conditional require at module level
    const { createClient } = require('@libsql/client');
    const { drizzle } = require('drizzle-orm/libsql');
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return drizzle(client, { schema });
  }
  
  // Default: local SQLite. A fresh clone should be runnable without asking the
  // user to create the data directory or apply migrations manually first.
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
  const databasePath = process.env.DATABASE_URL || DEFAULT_SQLITE_PATH;

  prepareSqlitePath(databasePath);

  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const database = drizzle(sqlite, { schema });

  if (process.env.SKIP_DATABASE_MIGRATIONS !== '1') {
    migrate(database, {
      migrationsFolder: path.join(process.cwd(), 'drizzle'),
    });
  }

  return database;
}

export const db = createDb();
export type DB = ReturnType<typeof createDb>;
