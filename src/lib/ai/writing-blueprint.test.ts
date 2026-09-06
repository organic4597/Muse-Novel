import { describe, expect, it } from 'vitest';

import {
  buildWritingBlueprintFromDraft,
  getInitialStoryIdea,
  getWritingBlueprint,
  updateWritingBlueprintSettings,
} from './writing-blueprint';

describe('writing blueprint', () => {
  it('extracts planning fields into a normalized blueprint', () => {
    expect(buildWritingBlueprintFromDraft({
      characters: [],
      worldEntries: [],
      pointOfView: ' 3인칭 제한 ',
      narrativeTense: '과거형',
      targetAudience: '성인 독자',
    })).toEqual({
      authorNote: undefined,
      contentBoundaries: undefined,
      endingDirection: undefined,
      formatGoal: undefined,
      narrativeTense: '과거형',
      pointOfView: '3인칭 제한',
      storyPromise: undefined,
      targetAudience: '성인 독자',
      tone: undefined,
      writingStyle: undefined,
    });
  });

  it('updates the blueprint without deleting unrelated project settings', () => {
    const settings = updateWritingBlueprintSettings(
      JSON.stringify({ createdFrom: 'story-planning', custom: { keep: true } }),
      { authorNote: '이번 장면은 의심을 키운다.', narrativeTense: '현재형' }
    );
    const parsed = JSON.parse(settings);

    expect(parsed.custom).toEqual({ keep: true });
    expect(getWritingBlueprint(settings)).toMatchObject({
      authorNote: '이번 장면은 의심을 키운다.',
      narrativeTense: '현재형',
    });
  });

  it('reads the original braindump as a synopsis fallback', () => {
    expect(getInitialStoryIdea(JSON.stringify({
      ideationSnapshot: { brainDump: '원래는 비 내리는 도시 이야기였다.' },
    }))).toBe('원래는 비 내리는 도시 이야기였다.');
  });

  it('recovers from malformed legacy settings', () => {
    expect(getWritingBlueprint('{broken')).toEqual({
      authorNote: undefined,
      contentBoundaries: undefined,
      endingDirection: undefined,
      formatGoal: undefined,
      narrativeTense: undefined,
      pointOfView: undefined,
      storyPromise: undefined,
      targetAudience: undefined,
      tone: undefined,
      writingStyle: undefined,
    });
  });
});
