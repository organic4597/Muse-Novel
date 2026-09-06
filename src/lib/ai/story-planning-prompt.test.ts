import { describe, expect, it } from 'vitest';

import {
  buildStoryPlanningMessages,
  extractStoryPlanningReplyPreview,
  getNextPhase,
  isPhaseComplete,
  parseStoryPlanningResponse,
} from './story-planning-prompt';
import type { StoryPlanningDraft, StoryPlanningMessage } from './story-planning-types';

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

describe('story planning prompt', () => {
  it('adds a dedicated writing setup phase before completion', () => {
    expect(getNextPhase('plot')).toBe('writing_setup');
    expect(getNextPhase('writing_setup')).toBe('complete');
  });

  it('requires both genre and tone before completing the first phase', () => {
    expect(isPhaseComplete('genre_tone', createDraft({ genre: 'SF' }))).toBe(false);
    expect(
      isPhaseComplete('genre_tone', createDraft({ genre: 'SF', tone: '쓸쓸함' }))
    ).toBe(true);
  });

  it('requires a usable plot package instead of advancing on one field', () => {
    expect(
      isPhaseComplete('plot', createDraft({ plotStructure: '3막 구조' }))
    ).toBe(false);
    expect(
      isPhaseComplete('plot', createDraft({
        endingDirection: '진실을 공개하지만 자신의 기억을 잃는다',
        firstChapterOutline: '실종 사건으로 시작',
        plotStructure: '3막 구조',
      }))
    ).toBe(true);
    expect(
      isPhaseComplete('plot', createDraft({
        endingDirection: '소림의 명예장로가 된다',
        firstChapterOutline: '무인들이 바위산을 수색한다',
        plotStructure: '1막은 소림으로 이동한다. 2막 이후 미정.',
      }))
    ).toBe(false);
  });

  it('extracts only the visible reply from an incomplete streamed JSON response', () => {
    expect(
      extractStoryPlanningReplyPreview(
        '{"reply":"첫 문장\\n**강조**와 \\uD1A0\\uB07C","draft":{'
      )
    ).toBe('첫 문장\n**강조**와 토끼');
  });

  it('separates prose configuration from plot completion', () => {
    expect(
      isPhaseComplete('writing_setup', createDraft({
        pointOfView: '3인칭 제한',
        narrativeTense: '과거형',
        writingStyle: '건조하고 빠른 문장',
      }))
    ).toBe(false);
    expect(
      isPhaseComplete('writing_setup', createDraft({
        targetAudience: '성인 미스터리 독자',
        pointOfView: '3인칭 제한',
        narrativeTense: '과거형',
        writingStyle: '건조하고 빠른 문장',
      }))
    ).toBe(true);
  });

  it('keeps only recent dialogue while retaining the structured draft', () => {
    const messages: StoryPlanningMessage[] = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}`,
    }));

    const result = buildStoryPlanningMessages(
      messages,
      createDraft({ title: '기억의 항구' }),
      '장면은 인물의 선택으로 전진한다.'
    );

    expect(result).toHaveLength(25);
    expect(result[0]?.content).toContain('기억의 항구');
    expect(result.some((message) => message.content === 'message-5')).toBe(false);
    expect(result.some((message) => message.content === 'message-6')).toBe(true);
    expect(result.at(-1)?.content).toBe('message-29');
    expect(result[0]?.content).toContain('title은 모든 단계에서 선택 사항');
    expect(result[0]?.content).toContain('premise 또는 synopsis에도 즉시 저장');
    expect(result[0]?.content).toContain('부분 갱신 객체');
    expect(result[0]?.content).toContain('<writing_reference>');
  });

  it('does not repeat historical draft snapshots in the dialogue payload', () => {
    const messages: StoryPlanningMessage[] = [
      {
        role: 'assistant',
        content: '인물 설정을 정리했습니다.',
        draftSnapshot: createDraft({
          synopsis: 'HISTORICAL_SNAPSHOT_SHOULD_NOT_BE_SERIALIZED',
        }),
        options: ['세계관으로 이동'],
      },
      { role: 'user', content: '현재 설정을 계속 다듬자.' },
    ];

    const result = buildStoryPlanningMessages(
      messages,
      createDraft({ synopsis: '현재 초안' })
    );

    expect(result[1]).toEqual({
      role: 'assistant',
      content: '인물 설정을 정리했습니다.',
    });
    expect(result.map((message) => message.content).join('\n')).not.toContain(
      'HISTORICAL_SNAPSHOT_SHOULD_NOT_BE_SERIALIZED'
    );
  });

  it('does not overwrite a complete draft field with a truncated JSON string', () => {
    const originalPromise =
      "토끼는 밥을 먹으러 내려왔지만 마지막에는 인간과의 인연을 선택한다.";
    const response = parseStoryPlanningResponse(
      '{"reply":"설정을 정리했습니다.","draft":{"storyPromise":"토끼는 밥을 먹으러 내려왔는데, 마지막에는 \'아,',
      createDraft({ storyPromise: originalPromise }),
      { stagedPhase: 'premise' }
    );

    expect(response.debug?.mode).toBe('fallback');
    expect(response.draft.storyPromise).toBe(originalPromise);
  });

  it('strips reasoning blocks and keeps accepted entities when parsing', () => {
    const fallback = createDraft({
      currentPhase: 'world',
      worldEntries: [{ category: '도시', title: '흑우항', content: '비가 내린다' }],
    });
    const response = parseStoryPlanningResponse(
      `<think>잊혀진 바다신전을 넣자</think>${JSON.stringify({
        reply: '새 조직을 후보로 추가했어요.',
        draft: {
          characters: [],
          currentPhase: 'world',
          worldEntries: [
            { category: '조직', title: '등대지기 조합', content: '항로를 관리한다' },
          ],
        },
      })}`,
      fallback,
      { stagedPhase: 'world' }
    );

    expect(response.reply).not.toContain('잊혀진 바다신전');
    expect(response.draft.worldEntries.map((entry) => entry.title)).toEqual(['흑우항']);
    expect(response.draft.pendingWorldEntries?.map((entry) => entry.title)).toEqual([
      '등대지기 조합',
    ]);
  });
});
