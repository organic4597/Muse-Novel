import { generateText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCharacterSuggestion, generateExistingEntityEdit, generateWorldEntrySuggestion } from './entity-suggestions';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: vi.fn(async () => ({ title: '테스트 작품', genre: '판타지' })) }));
vi.mock('@/lib/db/queries/characters', () => ({ listCharacters: vi.fn(async () => []) }));
vi.mock('@/lib/db/queries/ai-settings', () => ({ getDefaultProvider: vi.fn(async () => null), getGlobalDefaultProvider: vi.fn(async () => null) }));
vi.mock('@/lib/ai/daily-slogan', () => ({ getEnvProviderConfig: vi.fn(() => ({ provider: 'openai-compatible', modelId: 'local-test' })) }));
vi.mock('@/lib/ai/provider-factory', () => ({ createProvider: vi.fn(() => ({})) }));
vi.mock('@/lib/ai/provider-options', () => ({ getProviderOptions: vi.fn(() => ({})) }));
vi.mock('@/lib/ai/request-scheduler', () => ({ runAIRequest: vi.fn((_provider, options, run) => run(options.signal)) }));
vi.mock('@/lib/db/queries/world-categories', () => ({ listWorldCategories: vi.fn(async () => []) }));
vi.mock('@/lib/db/queries/world-entries', () => ({ listWorldEntries: vi.fn(async () => []) }));
vi.mock('@/lib/web-research/research', () => ({ researchForRequest: vi.fn(async () => ({ status: 'skipped', queries: [], sources: [] })), formatWebResearch: vi.fn(() => '') }));
vi.mock('@/lib/knowledge/writing-knowledge', () => ({ buildWritingKnowledgeContext: vi.fn(() => '') }));

describe('entity suggestion completion boundaries', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects length-limited output even when a JSON object is syntactically complete', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '{"name":"잘린 후보"}', finishReason: 'length' } as never);
    await expect(generateCharacterSuggestion({ projectId: 'project', description: '캐릭터 제안' })).rejects.toThrow('토큰 길이 한도');
  });
  it('accepts a normally completed JSON response', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '{"name":"완료 후보"}', finishReason: 'stop' } as never);
    await expect(generateCharacterSuggestion({ projectId: 'project', description: '캐릭터 제안' })).resolves.toMatchObject({ name: '완료 후보' });
  });
  it('uses the complete selected setting and proposes only changed allowed fields', async () => {
    vi.mocked(generateText).mockResolvedValue({ text: '{"changes":{"title":"소림사","content":"기존 배경. 명예장로 설정 추가."},"note":"요청 부분만 보강"}', finishReason: 'stop' } as never);
    const result = await generateExistingEntityEdit({ projectId: 'project', kind: 'world', snapshot: { title: '소림사', category: '장소', content: '기존 배경.', researchJson: null }, instruction: '명예장로 설정 추가', abortSignal: new AbortController().signal });
    expect(result.changes).toEqual({ content: '기존 배경. 명예장로 설정 추가.', researchJson: null });
    expect(vi.mocked(generateText).mock.calls[0][0]).toMatchObject({ prompt: expect.stringContaining('기존 배경.'), system: expect.stringContaining('다른 항목을 수정하지 않는다') });
  });
  it('rejects model attempts to change another entity or invent source metadata', async () => {
    for (const changes of [{ id: 'different' }, { researchJson: null }]) {
      vi.mocked(generateText).mockResolvedValue({ text: JSON.stringify({ changes }), finishReason: 'stop' } as never);
      await expect(generateExistingEntityEdit({ projectId: 'project', kind: 'world', snapshot: { title: '장소' }, instruction: '설명 수정해줘', abortSignal: new AbortController().signal })).rejects.toThrow();
    }
  });
  it('rejects an out-of-world genre explanation for a world entry', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '{"title":"모용세가","category":"세가","content":"무림 소설에서 메이저 세력으로 분류되며 여러 작품에서 자주 등장한다.","tags":["세가"]}',
      finishReason: 'stop',
    } as never);
    await expect(generateWorldEntrySuggestion({ projectId: 'project', description: '모용세가 추가' })).rejects.toThrow('작품 세계 밖의 장르 해설');
    expect(vi.mocked(generateText).mock.calls[0][0]).toMatchObject({ system: expect.stringContaining('현재 작품 세계에서 사실로 취급') });
  });
});
