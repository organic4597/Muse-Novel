import { defineConfig } from 'drizzle-kit';

const isTurso = process.env.DATABASE_PROVIDER === 'turso';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  ...(isTurso
    ? {
        driver: 'turso',
        dbCredentials: {
          url: process.env.TURSO_DATABASE_URL!,
          authToken: process.env.TURSO_AUTH_TOKEN,
        },
      }
    : {
        dbCredentials: {
          url: process.env.DATABASE_URL || 'data/sqlite.db',
        },
      }),
});
