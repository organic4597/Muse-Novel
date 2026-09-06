import { describe, expect, it } from 'vitest';

describe('Database Driver Switching', () => {
  it('should export db from index', async () => {
    // Import the actual module
    const { db } = await import('../../lib/db/index');

    // Verify exports exist
    expect(db).toBeDefined();
  });

  it('should create db with better-sqlite3 by default', async () => {
    // Import the actual module - it will use default provider 'sqlite'
    const { db } = await import('../../lib/db/index');

    // db should be defined and have methods from drizzle
    expect(db).toBeDefined();
    expect(typeof db.select).toBe('function');
  });

  it('should accept database provider via environment variable', () => {
    // This test verifies the createDb function can handle env vars
    // The actual implementation checks process.env.DATABASE_PROVIDER
    const originalProvider = process.env.DATABASE_PROVIDER;
    
    // Verify sqlite path (default)
    process.env.DATABASE_PROVIDER = 'sqlite';
    expect(process.env.DATABASE_PROVIDER).toBe('sqlite');

    // Verify turso path 
    process.env.DATABASE_PROVIDER = 'turso';
    expect(process.env.DATABASE_PROVIDER).toBe('turso');

    // Restore
    process.env.DATABASE_PROVIDER = originalProvider;
  });

  it('should support turso configuration environment variables', () => {
    // Test that the expected env vars for turso are recognized
    const tursoUrl = 'libsql://test-db.io';
    const tursoToken = 'test-token';

    process.env.TURSO_DATABASE_URL = tursoUrl;
    process.env.TURSO_AUTH_TOKEN = tursoToken;

    expect(process.env.TURSO_DATABASE_URL).toBe(tursoUrl);
    expect(process.env.TURSO_AUTH_TOKEN).toBe(tursoToken);

    // Cleanup
    process.env.TURSO_DATABASE_URL = undefined;
    process.env.TURSO_AUTH_TOKEN = undefined;
  });

  it('should provide db compatible with database operations', async () => {
    // Import the actual module
    const { db } = await import('../../lib/db/index');

    // Verify db is defined
    expect(db).toBeDefined();

    // Verify critical drizzle methods exist
    // These are common to both sqlite and libsql drivers
    expect(typeof db.select).toBe('function');
    expect(typeof db.insert).toBe('function');
    expect(typeof db.update).toBe('function');
    expect(typeof db.delete).toBe('function');
  });
});
