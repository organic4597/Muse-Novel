import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';

import * as schema from '../schema';

describe('Database Schema', () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  // Apply migrations to in-memory DB
  migrate(db, { migrationsFolder: './drizzle' });

  const tables = [
    'projects',
    'chapters',
    'characters',
    'character_relationships',
    'world_entries',
    'world_entry_links',
    'world_entry_tags',
    'ai_provider_settings',
  ];

  for (const table of tables) {
    it(`should have ${table} table`, () => {
      const result = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
        )
        .get(table);
      expect(result).toBeDefined();
    });
  }

  it('chapters should have FK to projects', () => {
    const fks = sqlite.prepare(`PRAGMA foreign_key_list(chapters)`).all();
    expect(fks.some((fk: any) => fk.table === 'projects')).toBe(true);
  });

  it('characters should have FK to projects', () => {
    const fks = sqlite.prepare(`PRAGMA foreign_key_list(characters)`).all();
    expect(fks.some((fk: any) => fk.table === 'projects')).toBe(true);
  });

  it('character_relationships should have FK to characters', () => {
    const fks = sqlite
      .prepare(`PRAGMA foreign_key_list(character_relationships)`)
      .all();
    const charFks = fks.filter((fk: any) => fk.table === 'characters');
    expect(charFks.length).toBe(2); // character_a_id + character_b_id
  });

  it('world_entry_links should have FK to world_entries', () => {
    const fks = sqlite
      .prepare(`PRAGMA foreign_key_list(world_entry_links)`)
      .all();
    const entryFks = fks.filter((fk: any) => fk.table === 'world_entries');
    expect(entryFks.length).toBe(2); // source_id + target_id
  });
});
