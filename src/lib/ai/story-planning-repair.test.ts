import { describe, expect, it } from 'vitest';

import {
  applyUserIntentToDraft,
  migrateLegacyStoryPlanningSession,
  repairStoryPlanningDraft,
} from './story-planning-repair';
import type { StoryPlanningDraft } from './story-planning-types';

function createDraft(
  overrides: Partial<StoryPlanningDraft> = {}
): StoryPlanningDraft {
  return {
    characters: [],
    currentPhase: 'genre_tone',
    worldEntries: [],
    ...overrides,
  };
}

describe('story planning repair', () => {
  it('never invents the legacy sea-temple world entry from related keywords', () => {
    const draft = applyUserIntentToDraft(
      '주인공은 도시 아래의 신전에서 유물을 발견해.',
      createDraft({ currentPhase: 'world' })
    );

    expect(draft.worldEntries).toEqual([]);
    expect(draft.pendingWorldEntries).toBeUndefined();
    expect(JSON.stringify(draft)).not.toContain('잊혀진 바다신전');
  });

  it('keeps the initial author idea as an immutable braindump source', () => {
    const draft = applyUserIntentToDraft(
      '비가 멈추지 않는 도시에서 기억을 수리하는 사람의 이야기',
      createDraft()
    );

    expect(draft.brainDump).toBe(
      '비가 멈추지 않는 도시에서 기억을 수리하는 사람의 이야기'
    );

    const repaired = repairStoryPlanningDraft(
      createDraft({ brainDump: '모델이 바꾼 요약' }),
      createDraft(),
      '비가 멈추지 않는 도시에서 기억을 수리하는 사람의 이야기'
    );
    expect(repaired.brainDump).toBe(
      '비가 멈추지 않는 도시에서 기억을 수리하는 사람의 이야기'
    );
  });

  it('preserves accepted entities when a later model response omits them', () => {
    const previous = createDraft({
      characters: [{ name: '윤서', role: '주인공' }],
      currentPhase: 'world',
      worldEntries: [
        { category: '도시', title: '흑우항', content: '비가 멈추지 않는 항구' },
      ],
    });
    const parsed = createDraft({
      currentPhase: 'world',
      worldEntries: [
        { category: '조직', title: '등대지기 조합', content: '항로를 관리한다' },
      ],
    });

    const repaired = repairStoryPlanningDraft(parsed, previous, '조직도 추가하자.');

    expect(repaired.characters.map((value) => value.name)).toEqual(['윤서']);
    expect(repaired.worldEntries.map((value) => value.title)).toEqual([
      '흑우항',
      '등대지기 조합',
    ]);
  });

  it('advances only when the user explicitly asks to move on', () => {
    const current = createDraft({ currentPhase: 'characters' });

    expect(applyUserIntentToDraft('주인공을 더 고민해보자.', current).currentPhase)
      .toBe('characters');
    expect(applyUserIntentToDraft('다음 단계로', current).currentPhase)
      .toBe('world');
    expect(
      applyUserIntentToDraft(
        '다음 단계로',
        createDraft({ currentPhase: 'plot' })
      ).currentPhase
    ).toBe('writing_setup');
  });

  it('removes the legacy artifact only when the user did not name it', () => {
    const draft = createDraft({
      pendingWorldEntries: [
        { category: '장소', title: '잊혀진 바다신전', content: '자동 생성됨' },
      ],
    });

    const migrated = migrateLegacyStoryPlanningSession(
      [{ role: 'assistant', content: '잊혀진 바다신전을 추가했어요.' }],
      draft
    );
    expect(migrated.changed).toBe(true);
    expect(migrated.draft.pendingWorldEntries).toBeUndefined();

    const preserved = migrateLegacyStoryPlanningSession(
      [{ role: 'user', content: '잊혀진 바다신전을 넣어줘.' }],
      draft
    );
    expect(preserved.changed).toBe(false);
  });
});
