import { expect, type Page, test } from '@playwright/test';

import { E2E_AUTH_STATE_PATH } from './helpers/auth';
import {
  OLLAMA_URL,
  TEST_CHARACTER,
  TEST_EDITOR_TEXT,
  TEST_PROJECT,
  TEST_WORLD_ENTRY,
} from './helpers/test-data';

/**
 * Full novel-writing workflow E2E test suite.
 *
 * Covers: project creation → character management → world-building
 *       → chapter management → editor writing → export.
 *
 * Tests are serial because each step depends on state from previous steps
 * (e.g. the project must exist before characters can be added).
 */
test.describe.serial('소설 작성 전체 워크플로우', () => {
  /** Shared state across serial tests */
  let page: Page;
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ storageState: E2E_AUTH_STATE_PATH });
  });

  test.afterAll(async () => {
    await page?.close();
  });

  test('프로젝트 생성', async () => {
    // Navigate to the project list page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The "새 소설" button triggers the CreateProjectForm to show an input
    await page.getByRole('button', { name: '새 소설' }).click();

    // Fill in the project title in the input (placeholder: "소설 제목을 입력하세요")
    const titleInput = page.getByPlaceholder('소설 제목을 입력하세요');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(TEST_PROJECT.title);

    // Submit the creation form
    await page.getByRole('button', { name: '생성' }).click();

    // Wait for navigation to the project detail page /projects/[id]
    await page.waitForURL(/\/projects\/[^/]+$/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Extract project ID from URL
    const url = page.url();
    const match = url.match(/\/projects\/([^/]+)$/);
    expect(match).toBeTruthy();
    projectId = match![1];

    // Verify we're on the project detail page — the title input should have our value
    const projectTitleInput = page.locator('input#title');
    await expect(projectTitleInput).toHaveValue(TEST_PROJECT.title);

    // Fill in genre and synopsis on the project edit form
    const genreInput = page.locator('input#genre');
    await genreInput.fill(TEST_PROJECT.genre);

    const synopsisTextarea = page.locator('textarea#synopsis');
    await synopsisTextarea.fill(TEST_PROJECT.synopsis);

    // Save the project details
    await page.getByRole('button', { name: '저장' }).click();
    await page.waitForLoadState('networkidle');
  });

  test('캐릭터 추가', async () => {
    // Navigate to the characters page
    await page.goto(`/projects/${projectId}/characters`);
    await page.waitForLoadState('networkidle');

    // Verify we see the characters heading
    await expect(page.getByRole('heading', { name: '캐릭터' })).toBeVisible();

    // Click "새 캐릭터" button to open the creation dialog
    await page.getByRole('button', { name: '새 캐릭터' }).click();

    // Wait for the dialog to appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Fill character name (input#char-name, placeholder: "캐릭터 이름")
    const nameInput = dialog.locator('input#char-name');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(TEST_CHARACTER.name);

    // Select character role from the <select> dropdown (id="char-role")
    const roleSelect = dialog.locator('select#char-role');
    await roleSelect.selectOption(TEST_CHARACTER.role);

    // Submit the form
    await dialog.getByRole('button', { name: '저장' }).click();

    // Wait for the dialog to close and the list to update
    await expect(dialog).toBeHidden({ timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Verify the character appears in the list
    const characterCard = page.getByRole('button', {
      name: new RegExp(`${TEST_CHARACTER.name}.*${TEST_CHARACTER.role}|${TEST_CHARACTER.role}.*${TEST_CHARACTER.name}`),
    });
    await expect(characterCard).toBeVisible();
  });

  test('세계관 추가', async () => {
    // Navigate to the world-building page
    await page.goto(`/projects/${projectId}/world`);
    await page.waitForLoadState('networkidle');

    // Verify we see the world page heading
    await expect(page.getByRole('heading', { name: '세계관' })).toBeVisible();

    // Click "새 항목" button to open the creation dialog
    await page.getByRole('button', { name: '새 항목' }).click();

    // Wait for the dialog to appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Fill world entry title (input#we-title, placeholder: "항목 제목")
    const titleInput = dialog.locator('input#we-title');
    await expect(titleInput).toBeVisible();
    await titleInput.fill(TEST_WORLD_ENTRY.title);

    // Select the category by clicking the category pill button
    // Categories are rendered as <button> elements with text matching the category
    await dialog.getByRole('button', { name: TEST_WORLD_ENTRY.category, exact: true }).click();

    // Fill content (textarea#we-content)
    const contentTextarea = dialog.locator('textarea#we-content');
    await contentTextarea.fill(TEST_WORLD_ENTRY.content);

    // Submit the form
    await dialog.getByRole('button', { name: '저장' }).click();

    // Wait for the dialog to close and the list to update
    await expect(dialog).toBeHidden({ timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Verify the world entry appears in the list
    await expect(page.getByText(TEST_WORLD_ENTRY.title)).toBeVisible();
    await expect(page.getByText(TEST_WORLD_ENTRY.content)).toBeVisible();
  });

  test('챕터 생성 및 에디터 작성', async () => {
    // Navigate to the write page
    await page.goto(`/projects/${projectId}/write`);
    await page.waitForLoadState('networkidle');

    // Verify the chapter sidebar is ready
    await expect(page.getByRole('button', { name: '새 챕터' })).toBeVisible();

    // Create a new chapter by clicking the "+" button (aria-label="새 챕터")
    await page.getByRole('button', { name: '새 챕터' }).click();

    // Wait for the chapter to appear in the sidebar
    // New chapters are created with default title "새 챕터"
    await expect(page.getByText('새 챕터')).toBeVisible({ timeout: 5000 });

    // The editor should now be visible (Plate editor uses [data-slate-editor])
    const editor = page.locator('[data-slate-editor]');
    await expect(editor).toBeVisible({ timeout: 10000 });

    // Click the editor to focus it
    await editor.click();

    // Type Korean text using insertText (NOT type, which doesn't work for Korean IME)
    await page.keyboard.insertText(TEST_EDITOR_TEXT);

    // Verify the text appears in the editor
    await expect(editor).toContainText(TEST_EDITOR_TEXT);

    // Wait for auto-save to trigger (2500ms debounce) and show "저장됨"
    // The AutoSaveIndicator shows "저장됨" after successful save
    await expect(page.getByText('저장됨')).toBeVisible({ timeout: 10000 });
  });

  test('고스트 텍스트 확인 (Ollama 필요)', async () => {
    // Check if Ollama is running — skip test if not available
    let ollamaAvailable = false;
    try {
      const response = await fetch(`${OLLAMA_URL}/api/tags`);
      ollamaAvailable = response.ok;
    } catch {
      ollamaAvailable = false;
    }

    test.skip(!ollamaAvailable, 'Ollama가 실행 중이 아닙니다 — 고스트 텍스트 테스트를 건너뜁니다');

    // Ensure we're still on the write page with the editor active
    const editor = page.locator('[data-slate-editor]');
    await expect(editor).toBeVisible();

    // Focus the editor and add some text to trigger copilot suggestion
    await editor.click();
    await page.keyboard.insertText('그날 밤 하늘에는');

    // Wait for the copilot debounce (700ms configured in copilot-kit.tsx) plus API response time
    // Ghost text renders as a <span> with class containing "text-muted-foreground/70"
    const ghostText = page.locator('span.pointer-events-none[contenteditable="false"]');

    // Give generous timeout for the AI completion to arrive
    await expect(ghostText).toBeVisible({ timeout: 15000 });

    // Verify ghost text has some content
    const ghostContent = await ghostText.textContent();
    expect(ghostContent).toBeTruthy();
    expect(ghostContent!.length).toBeGreaterThan(0);
  });

  test('내보내기', async () => {
    // Navigate to the project detail page where the ExportDialog would be rendered
    // Note: ExportDialog uses window.location.href for download, not a browser download event.
    // We need to navigate to a page that has the ExportDialog.
    // Since ExportDialog is not currently used in any page, we test the export API directly
    // by verifying the API endpoint responds correctly.

    // First, navigate to the write page (most logical place for export)
    await page.goto(`/projects/${projectId}/write`);
    await page.waitForLoadState('networkidle');

    // Test the export API endpoint directly since ExportDialog
    // uses window.location.href (not a download event)
    const exportResponse = await page.request.get(
      `/api/projects/${projectId}/export/txt`
    );

    // Verify the export endpoint returns successfully
    expect(exportResponse.ok()).toBeTruthy();

    // Verify response has content
    const body = await exportResponse.body();
    expect(body.length).toBeGreaterThan(0);

    // Also verify markdown export works
    const mdResponse = await page.request.get(
      `/api/projects/${projectId}/export/md`
    );
    expect(mdResponse.ok()).toBeTruthy();
  });

  test('정리 — 프로젝트 삭제', async () => {
    // Navigate back to the project detail page to clean up
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Handle the confirm dialog for deletion
    page.on('dialog', (dialog) => dialog.accept());

    // Click the "삭제" button (destructive variant)
    await page.getByRole('button', { name: '삭제' }).click();

    // Wait for redirect back to home page
    await page.waitForURL('/', { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Verify the project is no longer listed
    await expect(page.getByText(TEST_PROJECT.title, { exact: true })).toBeHidden();
  });
});
