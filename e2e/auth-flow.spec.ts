import { expect, test } from '@playwright/test';

import {
  completeFirstRunSetup,
  E2E_SETUP_TOKEN,
  loginAsE2EAdmin,
  saveE2EAuthState,
} from './helpers/auth';

test.describe.serial('관리자 인증 흐름', () => {
  test('최초 보호 페이지와 API는 초기 설정을 요구한다', async ({ page }) => {
    await page.goto('/settings/ai?source=e2e');

    await expect(page).toHaveURL(
      /\/setup\?returnTo=%2Fsettings%2Fai%3Fsource%3De2e$/u
    );
    await expect(page.getByRole('heading', { name: '작업실을 잠가둘게요' })).toBeVisible();

    const response = await page.request.get('/api/projects');
    expect(response.status()).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTH_SETUP_REQUIRED',
    });
  });

  test('잘못된 초기 설정 코드를 거부한다', async ({ page }) => {
    await completeFirstRunSetup(page, `${E2E_SETUP_TOKEN}-wrong`);

    await expect(page).toHaveURL(/\/setup$/u);
    await expect(
      page.getByText('초기 설정 코드가 올바르지 않습니다.', { exact: true })
    ).toBeVisible();

    const session = await page.request.get('/api/auth/session');
    await expect(session.json()).resolves.toMatchObject({
      authenticated: false,
      configured: false,
    });
  });

  test('올바른 코드로 관리자 최초 설정을 완료한다', async ({ page }) => {
    await completeFirstRunSetup(page);

    await expect(page).toHaveURL(/\/$/u);
    await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();

    const session = await page.request.get('/api/auth/session');
    await expect(session.json()).resolves.toMatchObject({
      authenticated: true,
      configured: true,
    });
  });

  test('비인증 리디렉션, 로그인, 로그아웃과 재로그인을 처리한다', async ({ page }) => {
    await page.goto('/settings/ai');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings%2Fai$/u);

    const unauthenticatedApi = await page.request.get('/api/projects');
    expect(unauthenticatedApi.status()).toBe(401);
    await expect(unauthenticatedApi.json()).resolves.toMatchObject({
      code: 'AUTH_REQUIRED',
    });

    await loginAsE2EAdmin(page);
    await expect(page).toHaveURL(/\/settings\/ai$/u);

    const authenticatedApi = await page.request.get('/api/projects');
    expect(authenticatedApi.ok()).toBeTruthy();

    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login$/u);

    const loggedOutApi = await page.request.get('/api/projects');
    expect(loggedOutApi.status()).toBe(401);

    await loginAsE2EAdmin(page);
    await expect(page).toHaveURL(/\/$/u);
    await saveE2EAuthState(page.context());
  });
});
