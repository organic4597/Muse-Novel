import * as schema from './schema';

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
  
  // Default: local SQLite
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const sqlite = new Database(process.env.DATABASE_URL || 'data/sqlite.db');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export const db = createDb();
export type DB = ReturnType<typeof createDb>;
