import { type Locator, type Page } from '@playwright/test';

/**
 * Type Korean text into a focused element using insertText.
 *
 * IMPORTANT: Do NOT use page.keyboard.type() for Korean — it sends individual
 * keystrokes that bypass IME composition, producing broken jamo characters.
 * insertText() injects the final composed text directly, matching how a real
 * IME commits characters after composition.
 */
export async function typeKorean(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  await page.locator(selector).click();
  await page.keyboard.insertText(text);
}

/**
 * Wait for the ghost text suggestion span to appear inside the Plate editor.
 *
 * GhostText (src/components/ui/ghost-text.tsx) renders:
 *   <span class="pointer-events-none text-muted-foreground/70 max-sm:hidden"
 *         contentEditable={false}>
 *     {suggestionText}
 *   </span>
 *
 * It is rendered by CopilotPlugin when isSuggested is true for the current
 * block. The span is contentEditable=false, nested inside [data-slate-editor].
 *
 * Returns the locator if found within timeout, null otherwise.
 */
export async function waitForGhostText(
  page: Page,
  timeout = 10_000
): Promise<Locator | null> {
  // Target the ghost text span: contentEditable=false inside the slate editor,
  // carrying the pointer-events-none class set by GhostText component.
  const ghostText = page
    .locator('[data-slate-editor]')
    .locator('span[contenteditable="false"].pointer-events-none');

  try {
    await ghostText.waitFor({ state: 'visible', timeout });
    return ghostText;
  } catch {
    return null;
  }
}

/**
 * Check if Ollama is running at the default local URL.
 * Used to conditionally skip tests that require AI ghost text generation.
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Navigate to the home page and create a new project, returning the project URL.
 * After creation the app redirects to /projects/<id>.
 */
export async function createProject(
  page: Page,
  title: string
): Promise<string> {
  await page.goto('/');
  // Click "새 소설" to expand the form
  await page.getByRole('button', { name: '새 소설' }).click();
  // Fill in the project title
  await page.getByPlaceholder('소설 제목을 입력하세요').fill(title);
  // Submit
  await page.getByRole('button', { name: '생성' }).click();
  // Wait for redirect to /projects/<id>
  await page.waitForURL(/\/projects\/[^/]+$/);
  return page.url();
}

/**
 * Navigate to the write page for a project and create + select a new chapter.
 * Returns when the Plate editor is visible and ready for input.
 *
 * @param projectUrl - URL like http://localhost:3000/projects/<id>
 */
export async function openWritePageWithChapter(
  page: Page,
  projectUrl: string
): Promise<void> {
  const writeUrl = projectUrl.replace(/\/$/, '') + '/write';
  await page.goto(writeUrl);

  // Create a new chapter via the sidebar button
  await page.getByRole('button', { name: '새 챕터' }).click();

  // Wait for the editor to appear (chapter is auto-selected after creation)
  await page.locator('[data-slate-editor]').waitFor({ state: 'visible' });
}
