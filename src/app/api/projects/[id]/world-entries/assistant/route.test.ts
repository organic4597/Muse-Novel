import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: vi.fn(async () => ({ id: 'project-1' })) }));
vi.mock('@/lib/db/queries/world-suggestions', () => ({
  saveWorldSuggestions: vi.fn(), listPendingWorldSuggestions: vi.fn(),
}));
vi.mock('@/lib/ai/entity-suggestions', () => ({
  generateWorldEntryBatch: vi.fn(),
  resolveWorldEntryRequestCount: vi.fn(() => 3),
}));
vi.mock('@/lib/db/queries/world-entries', () => ({
  createWorldEntry: vi.fn(),
  listWorldEntries: vi.fn(),
}));
vi.mock('@/lib/db/queries/world-entry-tags', () => ({
  addTag: vi.fn(),
}));

function createRequest(body: Record<string, unknown>) {
  return new NextRequest(
    'http://localhost/api/projects/project-1/world-entries/assistant',
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

describe('POST /api/projects/[id]/world-entries/assistant', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { listWorldEntries } = await import('@/lib/db/queries/world-entries');
    const { listPendingWorldSuggestions } = await import('@/lib/db/queries/world-suggestions');
    vi.mocked(listWorldEntries).mockResolvedValue([]);
    vi.mocked(listPendingWorldSuggestions).mockResolvedValue([]);
  });

  it('rejects an empty instruction', async () => {
    const { POST } = await import('./route');
    const response = await POST(createRequest({ instruction: '  ' }), {
      params: Promise.resolve({ id: 'project-1' }),
    });

    expect(response.status).toBe(400);
  });

  it('generates review drafts without writing canon entries or tags', async () => {
    const { saveWorldSuggestions } = await import('@/lib/db/queries/world-suggestions');
    const { generateWorldEntryBatch } = await import('@/lib/ai/entity-suggestions');
    const { addTag } = await import('@/lib/db/queries/world-entry-tags');
    const { createWorldEntry, listWorldEntries } = await import(
      '@/lib/db/queries/world-entries'
    );

    vi.mocked(listWorldEntries).mockResolvedValue([
      { category: '종파', id: 'existing', projectId: 'project-1', title: '소림', content: null },
    ] as never);
    vi.mocked(generateWorldEntryBatch).mockResolvedValue({
      operation: 'create',
      editSuggestions: [],
      entries: [
        { category: '종파', content: '기존 항목', title: '소림', tags: [], sourceIds: [] },
        { category: '종파', content: '도가 계열 검법 종파', tags: ['도가', '검법'], title: '무당', sourceIds: [] },
      ],
      research: { status: 'skipped' as const, queries: [], sources: [] },
      report: { instruction: '대표 종파 3개', requestedCount: 3, expectedTitles: ['소림', '무당', '화산'], existingTitles: [], pendingTitles: [], generatedCount: 2, missingTitles: ['화산'], warnings: [], diagnostics: [] },
    });
    vi.mocked(createWorldEntry).mockResolvedValue({
      category: '종파',
      content: '도가 계열 검법 종파',
      id: 'created-1',
      projectId: 'project-1',
      title: '무당',
    } as never);
    vi.mocked(addTag)
      .mockResolvedValueOnce({ id: 'tag-1', tag: '도가' } as never)
      .mockResolvedValueOnce({ id: 'tag-2', tag: '검법' } as never);
    vi.mocked(saveWorldSuggestions).mockResolvedValue([{ id: 'pending-1', title: '무당', status: 'pending', tags: ['도가', '검법'] }] as never);

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      instruction: '중원 무협의 대표 종파 3개를 추가해줘',
    }), {
      params: Promise.resolve({ id: 'project-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pendingCount).toBe(1);
    expect(body.suggestions[0]).toMatchObject({
      title: '무당',
      status: 'pending',
      tags: ['도가', '검법'],
    });
    expect(body.skippedTitles).toEqual(['소림']);
    expect(createWorldEntry).not.toHaveBeenCalled();
    expect(addTag).not.toHaveBeenCalled();
    expect(saveWorldSuggestions).toHaveBeenCalledWith(expect.anything(), 'project-1', [expect.objectContaining({ title: '무당' })], expect.objectContaining({ report: expect.objectContaining({ generatedCount: 1 }) }));
  });

  it('returns existing-entry edit proposals instead of silently skipping an update request', async () => {
    const { generateWorldEntryBatch } = await import('@/lib/ai/entity-suggestions');
    const { saveWorldSuggestions } = await import('@/lib/db/queries/world-suggestions');
    const edit = {
      entryId: 'existing', title: '모용세가', baseVersion: 'a'.repeat(64), note: '근거지를 보강했습니다.',
      before: { title: '모용세가', category: '세가', content: '기존 설명', researchJson: null },
      changes: { content: '모용세가는 요동의 교역로를 장악한 가문이다.' },
      research: { status: 'skipped' as const, queries: [], sources: [] },
    };
    vi.mocked(generateWorldEntryBatch).mockResolvedValue({
      operation: 'update', editSuggestions: [edit], entries: [],
      research: { status: 'skipped', queries: [], sources: [] },
      report: { instruction: '모용세가 설명 수정', requestedCount: 1, expectedTitles: ['모용세가'], existingTitles: ['모용세가'], updateTitles: ['모용세가'], pendingTitles: [], generatedCount: 0, missingTitles: [], warnings: [], diagnostics: [] },
    });
    vi.mocked(saveWorldSuggestions).mockResolvedValue([]);
    const { POST } = await import('./route');
    const response = await POST(createRequest({ instruction: '모용세가 설명을 요동의 가문으로 수정해줘' }), {
      params: Promise.resolve({ id: 'project-1' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ operation: 'update', editSuggestions: [edit], suggestions: [], pendingCount: 0 });
  });
});
