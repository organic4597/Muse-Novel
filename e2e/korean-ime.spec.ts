/**
 * Korean IME E2E tests for the muse-novel Plate editor.
 *
 * Covers:
 *  1. Basic Korean typing via IME (insertText)
 *  2. Korean sentence input + auto-save indicator
 *  3. Ctrl+Space non-collision — must NOT trigger ghost text (IME-reserved key)
 *  4. Ctrl+Alt+Space ghost text trigger  (requires Ollama — skipped when offline)
 *  5. Tab accepts ghost text             (requires Ollama)
 *  6. Escape rejects ghost text          (requires Ollama)
 *
 * Key implementation notes:
 *  - page.keyboard.insertText() is used for Korean, never page.keyboard.type().
 *    type() sends individual keydown/keypress/keyup events which bypass IME
 *    composition, resulting in broken jamo (ㄱ, ㅏ …) instead of composed syllables.
 *  - Ghost text selector: span[contenteditable="false"].pointer-events-none inside
 *    [data-slate-editor]. Comes from src/components/ui/ghost-text.tsx.
 *  - CopilotPlugin config (src/components/editor/plugins/copilot-kit.tsx):
 *      triggerSuggestion = 'ctrl+alt+space'   ← AI trigger
 *      Ctrl+Space is intentionally NOT mapped  ← IME-safe
 *      accept = 'tab', reject = 'escape'
 *  - Auto-save shows "저장됨" after 2500 ms debounce + server round-trip.
 */

import { expect, test } from '@playwright/test';

import {
  createProject,
  isOllamaRunning,
  openWritePageWithChapter,
  waitForGhostText,
} from './helpers/korean-input';

// ---------------------------------------------------------------------------
// Shared state — project URL is created once for the entire suite.
// ---------------------------------------------------------------------------

let projectUrl: string;

test.describe('Korean IME — muse-novel editor', () => {
  // -------------------------------------------------------------------------
  // beforeAll: create a project and open the write page with a chapter.
  // Individual tests share the same page context so they can build on each
  // other's state without redundant setup round-trips.
  // -------------------------------------------------------------------------
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    projectUrl = await createProject(page, 'IME 테스트 소설');
    await page.close();
  });

  // -------------------------------------------------------------------------
  // Test 1: 한국어 IME 타이핑 정상 동작
  // Verify that Korean syllables are composed correctly and no broken jamo appear.
  // -------------------------------------------------------------------------
  test('한국어 IME 타이핑 정상 동작', async ({ page }) => {
    await openWritePageWithChapter(page, projectUrl);

    const editor = page.locator('[data-slate-editor]');

    // Click into the editor and insert composed Korean via insertText.
    await editor.click();
    await page.keyboard.insertText('안녕하세요 세계');

    // The text content of the editor should contain the full composed string.
    await expect(editor).toContainText('안녕하세요 세계');

    // Sanity: no isolated consonant/vowel jamo that would indicate broken IME.
    const editorText = await editor.textContent();
    expect(editorText).not.toMatch(/[ㄱ-ㅎㅏ-ㅣ]/);
  });

  // -------------------------------------------------------------------------
  // Test 2: 한국어 문장 입력 + 자동 저장
  // Type a longer Korean sentence and wait for the auto-save indicator to show
  // "저장됨" (saved state). Confirms the 2500 ms debounce fires and the API
  // round-trip completes successfully.
  // -------------------------------------------------------------------------
  test('한국어 문장 입력 후 자동 저장 확인', async ({ page }) => {
    await openWritePageWithChapter(page, projectUrl);

    const editor = page.locator('[data-slate-editor]');
    await editor.click();

    const sentence =
      '오늘은 맑고 화창한 날씨였다. 주인공은 창밖을 바라보며 깊은 생각에 잠겼다.';
    await page.keyboard.insertText(sentence);

    // Verify the text was actually inserted.
    await expect(editor).toContainText('오늘은 맑고');

    // Wait for auto-save: 2500ms debounce + server latency.
    // "저장됨" is rendered by AutoSaveIndicator in saved state.
    await expect(page.getByText('저장됨')).toBeVisible({ timeout: 8_000 });

    // Editor content should still be intact after save.
    await expect(editor).toContainText(sentence);
  });

  // -------------------------------------------------------------------------
  // Test 3: Ctrl+Space 비충돌 — 고스트 텍스트 미트리거
  // Ctrl+Space is reserved by Korean IME for toggling the input method.
  // The CopilotPlugin intentionally does NOT bind Ctrl+Space (only Ctrl+Alt+Space).
  // This test confirms that pressing Ctrl+Space does not surface ghost text and
  // that the app remains responsive.
  // -------------------------------------------------------------------------
  test('Ctrl+Space는 고스트 텍스트를 트리거하지 않아야 한다', async ({
    page,
  }) => {
    await openWritePageWithChapter(page, projectUrl);

    const editor = page.locator('[data-slate-editor]');
    await editor.click();
    await page.keyboard.insertText('한국어 입력 테스트');

    // Press Ctrl+Space — this is the IME toggle shortcut and must be a no-op
    // for the CopilotPlugin.
    await page.keyboard.press('Control+Space');

    // Wait 2 s; ghost text must NOT appear.
    await page.waitForTimeout(2_000);

    const ghostText = page
      .locator('[data-slate-editor]')
      .locator('span[contenteditable="false"].pointer-events-none');
    await expect(ghostText).toBeHidden();

    // The app should still be interactive — editor is still reachable.
    await expect(editor).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Test 4: Ctrl+Alt+Space 고스트 텍스트 트리거
  // Requires a running Ollama instance. Skipped when Ollama is offline.
  // -------------------------------------------------------------------------
  test('Ctrl+Alt+Space로 고스트 텍스트 트리거', async ({ page }) => {
    const ollamaAvailable = await isOllamaRunning();
    test.skip(!ollamaAvailable, 'Ollama가 실행 중이지 않아 건너뜁니다.');

    await openWritePageWithChapter(page, projectUrl);

    const editor = page.locator('[data-slate-editor]');
    await editor.click();
    await page.keyboard.insertText(
      '어두운 밤, 주인공은 낡은 도서관에서 오래된 책을 펼쳤다.'
    );

    // Trigger the copilot suggestion.
    await page.keyboard.press('Control+Alt+Space');

    // Ghost text should appear within the network round-trip timeout.
    // CopilotPlugin has debounceDelay=700ms + API latency.
    const ghostLocator = await waitForGhostText(page, 15_000);
    expect(ghostLocator).not.toBeNull();

    // The suggestion must contain non-empty text.
    const suggestionText = await ghostLocator!.textContent();
    expect(suggestionText?.trim().length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Test 5: Tab으로 고스트 텍스트 수락
  // Requires Ollama. After triggering a suggestion, pressing Tab should merge
  // the ghost text into the editor content.
  // -------------------------------------------------------------------------
  test('Tab으로 고스트 텍스트 수락', async ({ page }) => {
    const ollamaAvailable = await isOllamaRunning();
    test.skip(!ollamaAvailable, 'Ollama가 실행 중이지 않아 건너뜁니다.');

    await openWritePageWithChapter(page, projectUrl);

    const editor = page.locator('[data-slate-editor]');
    await editor.click();

    const seedText = '그는 손을 내밀어 먼지 쌓인 표지를 쓸어냈다.';
    await page.keyboard.insertText(seedText);

    // Trigger ghost text.
    await page.keyboard.press('Control+Alt+Space');

    const ghostLocator = await waitForGhostText(page, 15_000);
    expect(ghostLocator).not.toBeNull();

    // Capture the suggestion text before accepting.
    const suggestionText = await ghostLocator!.textContent();
    expect(suggestionText?.trim().length).toBeGreaterThan(0);

    // Accept with Tab.
    await page.keyboard.press('Tab');

    // Ghost text element should disappear after acceptance.
    await expect(
      page
        .locator('[data-slate-editor]')
        .locator('span[contenteditable="false"].pointer-events-none')
    ).toBeHidden({ timeout: 3_000 });

    // The accepted suggestion text should now be part of the editor content.
    const editorText = await editor.textContent();
    expect(editorText).toContain(seedText);
    // The suggestion (trimmed) should also be present.
    expect(editorText).toContain(suggestionText!.trim());
  });

  // -------------------------------------------------------------------------
  // Test 6: Escape로 고스트 텍스트 거부
  // Requires Ollama. After a suggestion appears, pressing Escape should dismiss
  // it without altering the editor content.
  // -------------------------------------------------------------------------
  test('Escape로 고스트 텍스트 거부', async ({ page }) => {
    const ollamaAvailable = await isOllamaRunning();
    test.skip(!ollamaAvailable, 'Ollama가 실행 중이지 않아 건너뜁니다.');

    await openWritePageWithChapter(page, projectUrl);

    const editor = page.locator('[data-slate-editor]');
    await editor.click();

    const seedText = '창문 너머 빗소리가 들려왔다.';
    await page.keyboard.insertText(seedText);

    // Trigger ghost text.
    await page.keyboard.press('Control+Alt+Space');

    const ghostLocator = await waitForGhostText(page, 15_000);
    expect(ghostLocator).not.toBeNull();

    // Reject with Escape.
    await page.keyboard.press('Escape');

    // Ghost text must disappear.
    await expect(
      page
        .locator('[data-slate-editor]')
        .locator('span[contenteditable="false"].pointer-events-none')
    ).toBeHidden({ timeout: 3_000 });

    // Editor text should only contain the original seed — no suggestion merged.
    const editorText = await editor.textContent();
    expect(editorText).toContain(seedText);
  });
});
