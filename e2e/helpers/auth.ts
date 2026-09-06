import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserContext, Page } from '@playwright/test';

const E2E_AUTH_ROOT = path.resolve('test-results', 'e2e-auth');

/**
 * These values are test fixtures, not deployment credentials. The Playwright
 * web server always points at an isolated auth directory and ignores any
 * production setup token for the duration of the test run.
 */
export const E2E_ADMIN_USERNAME = 'e2e-admin';
export const E2E_ADMIN_PASSWORD = 'MuseNovel-E2E-Password-2026!';
export const E2E_SETUP_TOKEN = 'muse-novel-e2e-setup-token';

export const E2E_AUTH_DATA_DIR = path.join(E2E_AUTH_ROOT, 'server');
export const E2E_DATABASE_PATH = path.join(E2E_AUTH_ROOT, 'sqlite.db');
export const E2E_AUTH_STATE_PATH = path.join(E2E_AUTH_ROOT, 'admin.storage.json');

export async function completeFirstRunSetup(
  page: Page,
  setupToken = E2E_SETUP_TOKEN
): Promise<void> {
  await page.goto('/setup', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('초기 설정 코드').waitFor();
  await page.getByLabel('초기 설정 코드').fill(setupToken);
  await page.getByLabel('관리자 아이디').fill(E2E_ADMIN_USERNAME);
  await page.getByLabel('비밀번호', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByLabel('비밀번호 확인').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: '관리자 설정 완료' }).click();
}

export async function loginAsE2EAdmin(page: Page): Promise<void> {
  await page.getByLabel('아이디', { exact: true }).waitFor();
  await page.getByLabel('아이디', { exact: true }).fill(E2E_ADMIN_USERNAME);
  await page.getByLabel('비밀번호', { exact: true }).fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}

export async function saveE2EAuthState(context: BrowserContext): Promise<void> {
  await mkdir(path.dirname(E2E_AUTH_STATE_PATH), { recursive: true });
  await context.storageState({ path: E2E_AUTH_STATE_PATH });
}
