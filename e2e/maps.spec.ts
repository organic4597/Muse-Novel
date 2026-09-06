import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test('registers an optimized map and saves duplicate/inactive pins only on demand', async ({ page }) => {
  await page.goto('/');
  const project = await page.evaluate(async (title) => {
    const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, genre: '판타지' }) });
    return { status: response.status, body: await response.json() };
  }, `지도 E2E ${Date.now()}`);
  expect(project.status).toBe(201);
  const projectId = project.body.id as string;
  const entry = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/world-entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'E2E 왕국', category: '장소', content: '지도에 표시할 왕국입니다.' }) });
    return { status: response.status, body: await response.json() };
  }, projectId);
  expect(entry.status).toBe(201);
  await page.goto(`/projects/${projectId}/maps`);
  await page.getByText('＋ 새 지도 업로드').click();
  await page.getByLabel('새 지도 이름').fill('E2E 대륙');
  const buffer = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#cab98f' } }).png().toBuffer();
  await page.getByLabel('새 지도 이미지').setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer });
  await page.getByRole('button', { name: '지도 등록' }).click();
  const viewport = page.getByTestId('map-viewport');
  await expect(viewport).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('E2E 지도 폴더'));
  await page.getByRole('button', { name: '지도 폴더 추가' }).click();
  const folder = page.locator('[data-testid^="map-folder-"]').filter({ hasText: 'E2E 지도 폴더' });
  await expect(folder).toBeVisible();
  await page.locator('[data-testid^="map-row-"]').dragTo(folder);
  await expect(page.getByText(/E2E 지도 폴더.*이동했습니다/)).toBeVisible();
  const itemPanel = page.getByRole('complementary', { name: '지도 목록' });

  await itemPanel.getByRole('button', { name: /E2E 왕국/ }).click();
  await page.getByRole('button', { name: '화면 중앙에 배치' }).click();
  await expect(page.getByText('저장하지 않은 변경 있음')).toBeVisible();
  let catalog = await (await page.request.get(`/api/projects/${projectId}/maps`)).json();
  expect((await (await page.request.get(`/api/projects/${projectId}/maps/${catalog.maps[0].id}`)).json()).pins).toHaveLength(0);
  await page.getByRole('button', { name: /^저장$/ }).click();
  await expect(page.getByText('저장된 상태')).toBeVisible();

  await expect(page.locator('[data-testid="map-pin"] g')).toHaveAttribute('opacity', '0.6');
  await page.locator('[data-testid="map-pin"]').click();
  await expect(page.getByRole('button', { name: /사용자 팔레트 \d+ 추가/ })).toHaveCount(7);
  await page.getByLabel('새 사용자 팔레트 색상').evaluate((element) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '#ef233c');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('button', { name: '사용자 색상 1 핀 색상 선택' })).toBeVisible();
  await expect(page.locator('span.font-mono').filter({ hasText: '#EF233C' })).toBeVisible();
  await page.getByLabel('핀 활성 상태').uncheck();
  await page.getByRole('button', { name: /^저장$/ }).click();

  await page.locator('[data-testid="map-pin"]').click();
  await page.getByRole('button', { name: '원본 항목 수정' }).click();
  const editDialog = page.getByRole('dialog');
  await editDialog.getByLabel('제목').fill('E2E 수정 왕국');
  await editDialog.getByRole('button', { name: /^저장$/ }).click();
  await expect(editDialog).toBeHidden();
  await expect(itemPanel.getByRole('button', { name: /E2E 수정 왕국/ })).toBeVisible();

  await itemPanel.getByRole('button', { name: /E2E 수정 왕국/ }).click();
  await page.getByRole('button', { name: '화면 중앙에 배치' }).click();
  await page.getByRole('button', { name: /^저장$/ }).click();
  catalog = await (await page.request.get(`/api/projects/${projectId}/maps`)).json();
  const detail = await (await page.request.get(`/api/projects/${projectId}/maps/${catalog.maps[0].id}`)).json();
  expect(detail.pins).toHaveLength(2);

  expect(detail.pins.some((pin: { status: string }) => pin.status === 'inactive')).toBe(true);
  expect(detail.pins.some((pin: { flagColor: string }) => pin.flagColor === '#ef233c')).toBe(true);

  await page.evaluate(async (id) => { await fetch(`/api/projects/${id}`, { method: 'DELETE' }); }, projectId);
});
