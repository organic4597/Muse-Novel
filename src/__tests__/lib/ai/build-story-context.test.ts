import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildStoryContext } from '@/lib/ai/build-story-context';

// ── Mock factories ──────────────────────────────────────────────────────────

function mockProject(overrides?: Record<string, unknown>) {
  return {
    id: 'proj-1',
    title: '어둠의 왕국',
    genre: '판타지',
    synopsis: '용사가 마왕을 물리치는 이야기',
    settingsJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockCharacter(overrides?: Record<string, unknown>) {
  return {
    id: 'char-1',
    projectId: 'proj-1',
    name: '이수진',
    role: '주인공',
    appearance: '검은 머리, 갈색 눈',
    personality: '용감하고 정의로운 성격',
    backstory: '어린 시절 마을이 파괴된 후 복수를 다짐하게 된 전사. 오래된 예언에 의해 선택받은 자로서 마왕을 물리칠 운명을 가지고 있다.',
    arcDescription: '성장형 주인공',
    imagePath: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockWorldEntry(overrides?: Record<string, unknown>) {
  return {
    id: 'world-1',
    projectId: 'proj-1',
    category: '지역',
    title: '어둠의 성',
    content: '마왕이 거주하는 거대한 성으로, 항상 어두운 구름에 둘러싸여 있다. 성 내부에는 수많은 함정과 마물들이 배회한다.',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockChapter(overrides?: Record<string, unknown>) {
  return {
    id: 'chap-1',
    projectId: 'proj-1',
    title: '여행의 시작',
    order: 0,
    contentJson: null,
    outline: '주인공이 마을을 떠나 모험을 시작한다.',
    summary: '이수진이 고향을 떠나 첫 번째 동료를 만난다.',
    memo: null,
    wordCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db/queries/projects', () => ({
  getProject: vi.fn(),
}));

vi.mock('@/lib/db/queries/characters', () => ({
  listCharacters: vi.fn(),
}));

vi.mock('@/lib/db/queries/world-entries', () => ({
  listWorldEntries: vi.fn(),
}));

vi.mock('@/lib/db/queries/chapters', () => ({
  getChapter: vi.fn(),
  listChapters: vi.fn(),
}));

import { getProject } from '@/lib/db/queries/projects';
import { listCharacters } from '@/lib/db/queries/characters';
import { listWorldEntries } from '@/lib/db/queries/world-entries';
import { getChapter, listChapters } from '@/lib/db/queries/chapters';
import type { DB } from '@/lib/db';

const fakeDb = {} as DB;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listChapters).mockResolvedValue([]);
});

describe('buildStoryContext', () => {
  it('프로젝트 + 등장인물 + 세계관 정보를 포함한 컨텍스트를 생성한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject());
    vi.mocked(listCharacters).mockResolvedValue([mockCharacter()]);
    vi.mocked(listWorldEntries).mockResolvedValue([mockWorldEntry()]);

    const result = await buildStoryContext(fakeDb, 'proj-1');

    expect(result).toContain('## 소설 정보');
    expect(result).toContain('제목: 어둠의 왕국');
    expect(result).toContain('장르: 판타지');
    expect(result).toContain('줄거리: 용사가 마왕을 물리치는 이야기');
    expect(result).toContain('## 등장인물');
    expect(result).toContain('이수진');
    expect(result).toContain('주인공');
    expect(result).toContain('## 세계관');
    expect(result).toContain('어둠의 성');
    expect(result).toContain('지역');
  });

  it('등장인물/세계관이 없으면 프로젝트 정보만 반환한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject());
    vi.mocked(listCharacters).mockResolvedValue([]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);

    const result = await buildStoryContext(fakeDb, 'proj-1');

    expect(result).toContain('## 소설 정보');
    expect(result).toContain('제목: 어둠의 왕국');
    expect(result).not.toContain('## 등장인물');
    expect(result).not.toContain('## 세계관');
  });

  it('maxChars 파라미터로 전체 컨텍스트 길이를 제한한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject());
    vi.mocked(listCharacters).mockResolvedValue([
      mockCharacter(),
      mockCharacter({ id: 'char-2', name: '김영호', role: '동료', backstory: '긴 배경 '.repeat(100) }),
    ]);
    vi.mocked(listWorldEntries).mockResolvedValue([
      mockWorldEntry(),
      mockWorldEntry({ id: 'world-2', title: '마법의 숲', content: '아주 긴 설명 '.repeat(100) }),
    ]);

    const result = await buildStoryContext(fakeDb, 'proj-1', undefined, 500);

    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('존재하지 않는 프로젝트는 빈 문자열을 반환한다', async () => {
    vi.mocked(getProject).mockResolvedValue(undefined);

    const result = await buildStoryContext(fakeDb, 'non-existent');

    expect(result).toBe('');
  });

  it('chapterId가 제공되면 현재 챕터 정보를 포함한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject());
    vi.mocked(listCharacters).mockResolvedValue([]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);
    vi.mocked(listChapters).mockResolvedValue([mockChapter()]);
    vi.mocked(getChapter).mockResolvedValue(mockChapter());

    const result = await buildStoryContext(fakeDb, 'proj-1', 'chap-1');

    expect(result).toContain('## 현재 챕터');
    expect(result).toContain('제목: 여행의 시작');
    expect(result).toContain('개요: 주인공이 마을을 떠나 모험을 시작한다.');
  });

  it('chapterId가 없으면 챕터 섹션을 생략한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject());
    vi.mocked(listCharacters).mockResolvedValue([]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);

    const result = await buildStoryContext(fakeDb, 'proj-1');

    expect(result).not.toContain('## 현재 챕터');
    expect(getChapter).not.toHaveBeenCalled();
  });

  it('장르와 시놉시스가 없으면 해당 줄을 생략한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject({ genre: null, synopsis: null }));
    vi.mocked(listCharacters).mockResolvedValue([]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);

    const result = await buildStoryContext(fakeDb, 'proj-1');

    expect(result).toContain('제목: 어둠의 왕국');
    expect(result).not.toContain('장르:');
    expect(result).not.toContain('줄거리:');
  });

  it('등장인물의 성격과 배경 축약을 포함한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject());
    vi.mocked(listCharacters).mockResolvedValue([mockCharacter()]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);

    const result = await buildStoryContext(fakeDb, 'proj-1');

    expect(result).toContain('용감하고 정의로운 성격');
    // backstory should be truncated (축약)
    expect(result).toContain('이수진');
  });
});
