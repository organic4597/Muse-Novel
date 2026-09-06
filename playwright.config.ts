import { defineConfig, devices } from '@playwright/test';

import {
  E2E_AUTH_DATA_DIR,
  E2E_AUTH_STATE_PATH,
  E2E_DATABASE_PATH,
  E2E_SETUP_TOKEN,
} from './e2e/helpers/auth';

const externalBaseUrl = process.env.PLAYWRIGHT_EXTERNAL_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  outputDir: './test-results/playwright-artifacts',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // E2E scenarios share the local single-user SQLite database.
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: externalBaseUrl ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'auth-bootstrap',
      testMatch: /auth-flow\.spec\.ts/u,
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      dependencies: ['auth-bootstrap'],
      testIgnore: /auth-flow\.spec\.ts/u,
      use: {
        ...devices['Desktop Chrome'],
        storageState: E2E_AUTH_STATE_PATH,
      },
    },
  ],
  webServer: externalBaseUrl ? undefined : {
    command: 'bun dev',
    env: {
      DATABASE_PROVIDER: 'sqlite',
      DATABASE_URL: E2E_DATABASE_PATH,
      MUSE_AUTH_DATA_DIR: E2E_AUTH_DATA_DIR,
      MUSE_AUTH_SETUP_TOKEN: E2E_SETUP_TOKEN,
    },
    url: 'http://localhost:3000',
    // Reusing an arbitrary local server would bypass the isolated auth state.
    reuseExistingServer: false,
  },
});
