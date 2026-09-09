import { describe, expect, it, vi } from 'vitest';

vi.mock('./utils', async importOriginal => ({
  ...await importOriginal<typeof import('./utils')>(),
  addSelection: vi.fn(),
  formatTextFromMessages: vi.fn(() => '사용자: 더 긴장되게 바꿔줘'),
  getMarkdownWithSelection: vi.fn(() => '그는 <Selection>문을 열었다.</Selection> 뒤를 보았다.'),
  getSurroundingContext: vi.fn(() => ({ before: '앞 문단', after: '뒤 문단' })),
  isMultiBlocks: vi.fn(() => false),
}));

import { getGeneratePrompt } from './prompts';

describe('selected prose rewrite prompt', () => {
  it('keeps the exact selection boundary and gives the custom instruction explicit authority', () => {
    const prompt = getGeneratePrompt({} as never, { messages: [], rewriteInstruction: '더 긴장되게 전면 수정해줘' });
    expect(prompt).toContain('<Selection>문을 열었다.</Selection>');
    expect(prompt).toContain('더 긴장되게 전면 수정해줘');
    expect(prompt).toContain('단순한 동의어 교체');
  });
});
