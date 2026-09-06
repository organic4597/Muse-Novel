import { generateText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCharacterSuggestion, generateExistingEntityEdit, generateWorldEntryBatch, generateWorldEntrySuggestion } from './entity-suggestions';

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
vi.mock('@/lib/db/queries/world-suggestions', () => ({ listPendingWorldSuggestions: vi.fn(async () => []) }));
vi.mock('@/lib/db/queries/entity-revisions', () => ({ getEntityRevisionState: vi.fn() }));
vi.mock('@/lib/web-research/catalog', () => ({ loadWebReferenceSites: vi.fn(async () => []) }));
vi.mock('@/lib/web-research/research', () => ({ researchForRequest: vi.fn(async () => ({ status: 'skipped', queries: [], sources: [] })), formatWebResearch: vi.fn(() => '') }));
vi.mock('@/lib/knowledge/writing-knowledge', () => ({ buildWritingKnowledgeContext: vi.fn(() => '') }));

describe('entity suggestion completion boundaries', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(generateText).mockReset(); });
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
  it('preserves legitimate in-world words after contextual review', async () => {
    const content = '금서방은 소설을 필사해 파는 서점이다. 작가와 독자는 여기서 신분을 숨긴 채 금서를 거래한다.';
    vi.mocked(generateText)
      .mockResolvedValueOnce({ text: JSON.stringify({ title: '금서방', category: '장소', content }), finishReason: 'stop' } as never)
      .mockResolvedValueOnce({ text: JSON.stringify({ reviews: [{ title: '금서방', verdict: 'accept' }] }), finishReason: 'stop' } as never);
    await expect(generateWorldEntrySuggestion({ projectId: 'project', description: '금서방 추가' })).resolves.toMatchObject({ content });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(vi.mocked(generateText).mock.calls[1][0].prompt).toContain(content);
  });
  it('repairs a single description with contextual feedback and rechecks it', async () => {
    const makeResponse = (value: unknown) => ({ text: JSON.stringify(value), finishReason: 'stop' }) as never;
    const content = '모용세가는 요동의 교역로를 장악한 가문이다. 흥행을 위한 편리한 장치로 소비된다.';
    const repaired = '모용세가는 요동의 교역로를 장악한 가문이다. 교역으로 얻은 재물은 가문의 곳간으로 모인다.';
    vi.mocked(generateText)
      .mockResolvedValueOnce(makeResponse({ title: '모용세가', category: '세가', content }))
      .mockResolvedValueOnce(makeResponse({ reviews: [{ title: '모용세가', verdict: 'revise', evidence: '흥행을 위한 편리한 장치로 소비된다.', reason: '가문의 활동을 설명하는 관점으로 보완한다.' }] }))
      .mockResolvedValueOnce(makeResponse({ title: '모용세가', category: '세가', content: repaired }))
      .mockResolvedValueOnce(makeResponse({ reviews: [{ title: '모용세가', verdict: 'accept' }] }));
    await expect(generateWorldEntrySuggestion({ projectId: 'project', description: '모용세가 추가' })).resolves.toMatchObject({ content: repaired });
    expect(vi.mocked(generateText).mock.calls[2][0].prompt).toContain('가문의 활동을 설명하는 관점');
    expect(generateText).toHaveBeenCalledTimes(4);
  });
  it('turns a semantically classified update request into an existing-entry review proposal', async () => {
    const { listWorldEntries } = await import('@/lib/db/queries/world-entries');
    const { getEntityRevisionState } = await import('@/lib/db/queries/entity-revisions');
    vi.mocked(listWorldEntries).mockResolvedValueOnce([{ id: 'existing', projectId: 'project', title: '모용세가', category: '세가', content: '기존 설명', researchJson: null }] as never);
    vi.mocked(getEntityRevisionState).mockReturnValue({
      entry: { id: 'existing', projectId: 'project' },
      snapshot: { title: '모용세가', category: '세가', content: '기존 설명', researchJson: null },
      version: 'b'.repeat(64),
    });
    const response = (value: unknown) => ({ text: JSON.stringify(value), finishReason: 'stop' }) as never;
    vi.mocked(generateText)
      .mockResolvedValueOnce(response({ taskSummary: '모용세가 설명 보강', operation: 'update', lookupQueries: [] }))
      .mockResolvedValueOnce(response({ needsSearch: false, groups: [{ label: '기존 세가', expectedCount: 1, members: ['모용세가'] }] }))
      .mockResolvedValueOnce(response({ valid: true, expectedCount: 1, issues: [] }))
      .mockResolvedValueOnce(response({ changes: { content: '기존 설명에 요동의 교역 기반을 보강했다.' }, note: '근거지 보강' }));
    const result = await generateWorldEntryBatch({ projectId: 'project', instruction: '모용세가 설명에 요동의 교역 기반을 추가해줘' });
    expect(result).toMatchObject({
      operation: 'update', entries: [],
      editSuggestions: [{ entryId: 'existing', title: '모용세가', baseVersion: 'b'.repeat(64), changes: { content: '기존 설명에 요동의 교역 기반을 보강했다.', researchJson: null } }],
      report: { existingTitles: ['모용세가'], updateTitles: ['모용세가'] },
    });
    expect(getEntityRevisionState).toHaveBeenCalledWith(expect.anything(), { projectId: 'project', kind: 'world', entityId: 'existing' });
    expect(generateText).toHaveBeenCalledTimes(4);
  });
});
