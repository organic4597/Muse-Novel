import { describe, expect, it } from 'vitest';

import {
  buildAgentCritiquePrompt,
  buildAgentDraftPrompt,
  buildAgentPlanPrompt,
  buildAgentRevisionPrompt,
} from './writing-agent';

describe('writing agent prompts', () => {
  it('keeps retrieval, planning, drafting, critique and revision responsibilities separate', () => {
    const plan = buildAgentPlanPrompt({
      instruction: '대치 장면',
      knowledge: '대사는 목적을 가져야 한다.',
      memory: '주인공은 검을 잃었다.',
      storyContext: '3인칭 과거형',
    });
    expect(plan).toContain('연속성 주의점');
    expect(plan).toContain('주인공은 검을 잃었다.');

    const draft = buildAgentDraftPrompt({
      currentProse: '그는 빈 칼집을 만졌다.',
      cursorAfter: '장로가 대답을 기다렸다.',
      cursorBefore: '그는 빈 칼집을 만졌다.',
      instruction: '대치 장면',
      knowledge: '대사의 목적을 유지한다.',
      memory: '검은 분실 상태다.',
      plan: '말로 시간을 번다.',
      storyContext: '3인칭 과거형',
      targetLength: 1500,
    });
    expect(draft).toContain('약 1500자');
    expect(draft).toContain('새 본문만 출력');
    expect(draft).toContain('검은 분실 상태다.');
    expect(draft).toContain('cursor_before');
    expect(draft).toContain('장로가 대답을 기다렸다.');
    expect(draft).toContain('앞뒤 원문을 반복');

    expect(
      buildAgentCritiquePrompt({
        draft: '초안',
        instruction: '요청',
        knowledge: '작법',
        memory: '정전',
        storyContext: '문맥',
      })
    ).toContain('소지품');
    expect(
      buildAgentRevisionPrompt({
        critique: '비평',
        currentProse: '앞 문장',
        cursorAfter: '뒤 문장',
        cursorBefore: '앞 문장',
        draft: '초안',
        instruction: '요청',
        knowledge: '작법',
        memory: '정전',
        storyContext: '문맥',
      })
    ).toContain('앞뒤 문맥 사이에 삽입할 완성 본문만 출력');
  });
});
