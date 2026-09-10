import { describe, expect, it, vi } from 'vitest';

import {
  buildAgentCritiquePrompt,
  buildAgentDraftPrompt,
  buildAgentPlanPrompt,
  buildAgentRevisionPrompt,
  buildAgentContinuationPrompt,
  buildAgentBeatPrompt,
  calculateSceneBeatCount,
  allocateBeatLengths,
  applyValidatedRewrites,
  splitSceneBeats,
  joinWritingContinuation,
  extendWritingToTarget,
} from './writing-agent';
import { hasOpenSceneQuestions, parseScenePlan } from '@/lib/writing-workbench';

describe('writing agent prompts', () => {
  it('upgrades legacy scene plans without losing their existing fields', () => {
    const plan = parseScenePlan({ viewpoint: '곽진봉', location: '북악 향산', goal: '정보를 모은다', obstacle: '', beats: '접근한다', outcome: '', reveal: '', conceal: '', preserve: '' });
    expect(plan.viewpoint).toBe('곽진봉');
    expect(plan.participants).toBe('');
    expect(plan.openQuestions).toBe('');
    expect(hasOpenSceneQuestions({ ...plan, openQuestions: '없음.' })).toBe(false);
    expect(hasOpenSceneQuestions({ ...plan, openQuestions: '장로의 제안을 받을 것인가?' })).toBe(true);
  });

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
    expect(draft).toContain('1500자의 90~110%');
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
        targetLength: 1500,
      })
    ).toContain('앞뒤 문맥 사이에 삽입할 완성 본문만 출력');
    expect(buildAgentContinuationPrompt({ currentText: '문을 열었다.', cursorAfter: '', plan: '안으로 간다.', remainingLength: 800, targetLength: 1500 })).toContain('약 800자');
  });

  it('joins continuation without repeating the model-overlapped boundary', () => {
    expect(joinWritingContinuation('그는 문을 열었다.', '그는 문을 열었다. 안으로 들어갔다.')).toBe('그는 문을 열었다.\n\n안으로 들어갔다.');
  });

  it('requests bounded continuation passes until generated prose reaches the target range', async () => {
    const generate = vi.fn().mockResolvedValueOnce('나'.repeat(320)).mockResolvedValueOnce('다'.repeat(320));
    const result = await extendWritingToTarget({ initialText: '가'.repeat(400), targetLength: 1000, generate });
    expect(result.length).toBeGreaterThanOrEqual(900);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('splits target length into roughly 700-1000 character causal beats', () => {
    expect(calculateSceneBeatCount(1800)).toBe(2);
    expect(calculateSceneBeatCount(6000)).toBe(7);
    expect(allocateBeatLengths(1800, 2)).toEqual([900, 900]);
    expect(splitSceneBeats('1. 접근한다\n- 거짓말을 발견한다')).toEqual([
      '접근한다',
      '거짓말을 발견한다',
    ]);
    const prompt = buildAgentBeatPrompt({
      beat: '거짓말을 발견하고 침묵을 택한다', beatIndex: 1, beatLength: 900,
      completedBeats: ['경계의 말을 엿듣는다'], contract: '대화 목적: 의도를 확인한다',
      currentProse: '앞 비트 본문', cursorAfter: '기존 뒤 문장', instruction: '대치 장면',
      knowledge: '대사는 목적을 가진다', memory: '주인공은 검을 잃었다', storyContext: '3인칭 과거', totalBeats: 2,
    });
    expect(prompt).toContain('약 900자');
    expect(prompt).toContain('경계의 말을 엿듣는다');
    expect(prompt).toContain('뜬구름 대화');
    expect(prompt).toContain('cursor_after');
  });

  it('applies only unique non-overlapping rewrites to generated prose', () => {
    const result = applyValidatedRewrites('첫 문장. 둘째 문장. 셋째 문장.', [
      { original: '첫 문장.', replacement: '첫 문장을 고쳤다.' },
      { original: '셋째 문장.', replacement: '마지막 문장.' },
    ]);
    expect(result).toEqual({
      applied: 2,
      text: '첫 문장을 고쳤다. 둘째 문장. 마지막 문장.',
    });
    expect(applyValidatedRewrites('반복 반복', [{ original: '반복', replacement: '교체' }]).applied).toBe(0);
  });
});
