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

vi.mock('@/lib/db/queries/story-state', () => ({
  listStoryStateEntries: vi.fn(),
}));

vi.mock('@/lib/db/queries/chapters', () => ({
  getChapterSummary: vi.fn(),
  listChapterSummaries: vi.fn(),
}));

vi.mock('@/lib/db/queries/chapter-references', () => ({
  getChapterReferences: vi.fn(),
}));

vi.mock('@/lib/db/queries/character-affiliations', () => ({
  getAffiliationSummariesAt: vi.fn(() => new Map()),
}));

import type { DB } from '@/lib/db';
import { getChapterReferences } from '@/lib/db/queries/chapter-references';
import {
  getChapterSummary,
  listChapterSummaries,
} from '@/lib/db/queries/chapters';
import { listCharacters } from '@/lib/db/queries/characters';
import { getProject } from '@/lib/db/queries/projects';
import { listStoryStateEntries } from '@/lib/db/queries/story-state';
import { listWorldEntries } from '@/lib/db/queries/world-entries';

const fakeDb = {} as DB;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listChapterSummaries).mockResolvedValue([]);
  vi.mocked(listStoryStateEntries).mockResolvedValue([]);
  vi.mocked(getChapterReferences).mockResolvedValue({ chapterId: 'chap-1', revision: 0, references: [], options: { characters: [], worldEntries: [] } });
});

describe('buildStoryContext', () => {
  it('현재 회차 등장 구분과 해당 시점 소속을 우선 문맥에 포함한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject());
    vi.mocked(listCharacters).mockResolvedValue([mockCharacter()]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);
    vi.mocked(getChapterSummary).mockResolvedValue(mockChapter());
    vi.mocked(listChapterSummaries).mockResolvedValue([mockChapter()]);
    vi.mocked(getChapterReferences).mockResolvedValue({
      chapterId: 'chap-1', revision: 1, options: { characters: [], worldEntries: [] },
      references: [{ id: 'ref-1', projectId: 'proj-1', chapterId: 'chap-1', characterId: 'char-1', worldEntryId: null,
        title: '이수진', category: null, group: 'character', presence: 'appears', displayGroupOverride: null,
        note: '성문을 조사한다', sortOrder: 0, createdAt: null, updatedAt: null,
        affiliations: [{ organizationTitle: '소림사', position: '객원', isPrimary: 1 }],
      }],
    } as never);
    const result = await buildStoryContext(fakeDb, 'proj-1', 'chap-1');
    expect(result).toContain('이번 화 등장 항목');
    expect(result).toContain('[character / 직접 등장] 이수진');
    expect(result).toContain('소림사 · 객원');
    expect(result).toContain('성문을 조사한다');
  });

  it('미래 회차 상태 메모를 이전 회차 문맥에서 제외한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject());
    vi.mocked(listCharacters).mockResolvedValue([]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);
    vi.mocked(getChapterSummary).mockResolvedValue(mockChapter());
    vi.mocked(listChapterSummaries).mockResolvedValue([mockChapter(), mockChapter({ id: 'chap-2', title: '승진', order: 1 })]);
    vi.mocked(listStoryStateEntries).mockResolvedValue([
      { id: 'past', projectId: 'proj-1', chapterId: 'chap-1', chapterTitle: '여행의 시작', characterId: null, characterName: null, category: '목표', label: '여행', value: '시작', previousValue: null, details: null, isActive: 1, isPinned: 0, createdAt: null, updatedAt: null },
      { id: 'future', projectId: 'proj-1', chapterId: 'chap-2', chapterTitle: '승진', characterId: null, characterName: null, category: '기타', label: '직위', value: '장로', previousValue: null, details: null, isActive: 1, isPinned: 0, createdAt: null, updatedAt: null },
    ] as never);
    const result = await buildStoryContext(fakeDb, 'proj-1', 'chap-1');
    expect(result).toContain('여행: 시작');
    expect(result).not.toContain('직위: 장로');
  });
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
    vi.mocked(listChapterSummaries).mockResolvedValue([mockChapter()]);
    vi.mocked(getChapterSummary).mockResolvedValue(mockChapter());

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
    expect(getChapterSummary).not.toHaveBeenCalled();
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

  it('집필 기준과 현재 작가 노트를 생성 컨텍스트에 포함한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject({
      settingsJson: JSON.stringify({
        writingBlueprint: {
          targetAudience: '성인 미스터리 독자',
          storyPromise: '기억과 진실의 반전',
          pointOfView: '3인칭 제한',
          narrativeTense: '과거형',
          writingStyle: '짧고 건조한 문장',
          authorNote: '이번 장면은 범인의 정체를 직접 밝히지 않는다.',
        },
      }),
    }));
    vi.mocked(listCharacters).mockResolvedValue([]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);

    const result = await buildStoryContext(fakeDb, 'proj-1');

    expect(result).toContain('## 집필 기준');
    expect(result).toContain('주요 독자층: 성인 미스터리 독자');
    expect(result).toContain('서술 시제: 과거형');
    expect(result).toContain('## 현재 작가 노트');
    expect(result).toContain('범인의 정체를 직접 밝히지 않는다');
  });

  it('컨텍스트가 잘려도 현재 작가 노트를 보존한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject({
      synopsis: '긴 시놉시스 '.repeat(200),
      settingsJson: JSON.stringify({
        writingBlueprint: {
          authorNote: '이번 장면에서는 문을 열지 않는다.',
        },
      }),
    }));
    vi.mocked(listCharacters).mockResolvedValue([]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);

    const result = await buildStoryContext(fakeDb, 'proj-1', undefined, 300);

    expect(result).toHaveLength(300);
    expect(result).toContain('## 현재 작가 노트');
    expect(result).toContain('이번 장면에서는 문을 열지 않는다.');
  });

  it('커서 주변에서 언급된 세계관 항목을 먼저 배치한다', async () => {
    vi.mocked(getProject).mockResolvedValue(mockProject());
    vi.mocked(listCharacters).mockResolvedValue([]);
    vi.mocked(listWorldEntries).mockResolvedValue([
      mockWorldEntry({ id: 'world-1', title: '먼 도시' }),
      mockWorldEntry({ id: 'world-2', title: '현재 항구' }),
    ]);

    const result = await buildStoryContext(
      fakeDb,
      'proj-1',
      undefined,
      {
        focusText: '주인공은 현재 항구의 창고에 숨어 있었다.',
        maxChars: 4000,
      }
    );

    expect(result.indexOf('현재 항구')).toBeLessThan(result.indexOf('먼 도시'));
  });

  it('활성 상태 메모를 현재 정전으로 포함하고 잘려도 보존한다', async () => {
    vi.mocked(getProject).mockResolvedValue(
      mockProject({ synopsis: '긴 시놉시스 '.repeat(200) })
    );
    vi.mocked(listCharacters).mockResolvedValue([]);
    vi.mocked(listWorldEntries).mockResolvedValue([]);
    vi.mocked(listStoryStateEntries).mockResolvedValue([
      {
        category: '소지품',
        chapterId: 'chap-1',
        chapterTitle: '3장',
        characterId: 'char-1',
        characterName: '이수진',
        createdAt: new Date(),
        details: '아직 사용법을 모른다.',
        id: 'state-1',
        isActive: 1,
        isPinned: 1,
        label: '청룡검',
        previousValue: '미소지',
        projectId: 'proj-1',
        updatedAt: new Date(),
        value: '이수진이 소지',
      },
    ]);

    const result = await buildStoryContext(fakeDb, 'proj-1', undefined, 260);

    expect(result.length).toBeLessThanOrEqual(260);
    expect(result).toContain('## 지속 상태 메모');
    expect(result).toContain('청룡검');
    expect(listStoryStateEntries).toHaveBeenCalledWith(fakeDb, 'proj-1', {
      activeOnly: true,
    });
  });
});
