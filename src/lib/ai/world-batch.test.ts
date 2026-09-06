import { describe, expect, it, vi } from 'vitest';
import { buildValidatedWorldBatch } from './world-batch';
import { planWorldRequest, validateWorldRoster } from './world-request';

// Domain data belongs to model responses/fixtures, never production parsing rules.
const groups = [
  { label: '오대세가', expectedCount: 5, members: ['남궁세가', '모용세가', '제갈세가', '사천당가', '하북팽가'] },
  { label: '구파일방', expectedCount: 10, members: ['소림사', '무당파', '화산파', '종남파', '아미파', '곤륜파', '공동파', '청성파', '점창파', '개방'] },
];
const request = '5대세가와 9파 1방을 기본 정보와 함께 추가해줘';
const base = { instruction: request, existing: [], pending: [], categories: ['종파', '세가'], context: '현재 작품의 설정', localReference: '내부 위키 참고 정보', research: { status: 'skipped' as const, queries: [], sources: [] }, diagnostics: [] };
function details(prompt: string) {
  const targets = JSON.parse(prompt.match(/<targets>\n([\s\S]*?)\n<\/targets>/)?.[1] ?? '[]') as { title: string; group: string }[];
  return { entries: targets.map(({ title }) => ({ title, category: '설정', content: `${title}은 중원 각지에 뿌리를 둔 세력이다. 고유한 전승과 이해관계를 지키며 주변 문파와 협력하거나 충돌한다.`, tags: [], sourceIds: [] })) };
}
function reviewedEntries(prompt: string) {
  return JSON.parse(prompt.match(/<candidate_descriptions>\n([\s\S]*?)\n<\/candidate_descriptions>/)?.[1] ?? '[]') as { title: string; content: string }[];
}
function modelResponse(_system: string, prompt: string, options: { stage: string }) {
  if (options.stage.startsWith('roster')) return { groups };
  if (options.stage === 'verify-roster') return { valid: true, expectedCount: 15, issues: [] };
  if (options.stage === 'review-descriptions') return { reviews: reviewedEntries(prompt).map(({ title }) => ({ title, verdict: 'accept' })) };
  return details(prompt);
}

describe('generic request interpretation and world generation', () => {
  it.each([['5대세가와 9파 1방'], ['오대세가 + 구파일방'], ['황도 12궁']])('does not hardcode domain knowledge for %s', (instruction) => {
    expect(planWorldRequest(instruction).countHint).toBeUndefined();
  });
  it.each([['5개 중 3개', 3], ['문파 5개와 세가 3개', 8], ['총 8개, 문파 5개와 세가 3개', 8], ['열두 개', 12]])('recognizes only explicit quantity syntax: %s', (instruction, count) => {
    expect(planWorldRequest(instruction).countHint).toBe(count);
  });
  it('checks cardinality inside the model-interpreted groups', () => {
    expect(validateWorldRoster({ groups }, planWorldRequest(request))).toHaveLength(15);
    expect(() => validateWorldRoster({ groups: [{ label: '대상', expectedCount: 15, members: ['하나', '둘', '셋'] }] }, {})).toThrow('15개');
  });
  it('builds the complete model-extracted manifest through small calls', async () => {
    const generate = vi.fn(async (...args: Parameters<typeof modelResponse>) => modelResponse(...args));
    const result = await buildValidatedWorldBatch({ ...base, generate });
    expect(result.entries).toHaveLength(15);
    expect(result.report.requestedCount).toBe(15);
    expect(result.report.missingTitles).toEqual([]);
    expect(generate).toHaveBeenCalledTimes(10);
    const prompt = generate.mock.calls[2][1];
    expect(prompt.indexOf('<project_context>') < prompt.indexOf('<targets>')).toBe(true);
  });
  it('looks up missing information before extracting a new manifest', async () => {
    const order: string[] = [];
    const lookup = vi.fn(async () => { order.push('lookup'); return { status: 'searched' as const, queries: ['묶음 구성'], sources: [] }; });
    const generate = vi.fn(async (system, prompt, options) => {
      order.push(options.stage);
      if (options.stage === 'roster') return { needsSearch: true, groups: [] };
      return modelResponse(system, prompt, options);
    });
    const result = await buildValidatedWorldBatch({ ...base, generate, lookup });
    expect(order.slice(0, 4)).toEqual(['roster', 'lookup', 'roster-after-lookup', 'verify-roster']);
    expect(result.entries).toHaveLength(15);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it('does not search when the available project/wiki data is sufficient', async () => {
    const lookup = vi.fn();
    await buildValidatedWorldBatch({ ...base, generate: async (...args) => modelResponse(...args), lookup });
    expect(lookup).not.toHaveBeenCalled();
  });
  it('uses a semantic review to reject a plan that replaces the requested members with large categories', async () => {
    const generate = vi.fn(async (_system, _prompt, options) => options.stage === 'verify-roster'
      ? { valid: false, expectedCount: 15, issues: ['개별 구성원 대신 상위 분류를 만들었음'] }
      : { groups: [{ label: '분류', expectedCount: 3, members: ['무림 정파', '사파', '개방'] }] });
    await expect(buildValidatedWorldBatch({ ...base, generate })).rejects.toThrow('상위 분류');
    expect(generate.mock.calls.some(([, , options]) => options.stage.startsWith('details'))).toBe(false);
  });
  it('reports existing members separately without inventing replacements', async () => {
    const result = await buildValidatedWorldBatch({ ...base, existing: [{ title: '소림사' }], pending: [{ title: '개방' }], generate: async (...args) => modelResponse(...args) });
    expect(result.entries).toHaveLength(13);
    expect(result.report.existingTitles).toEqual(['소림사']);
    expect(result.report.pendingTitles).toEqual(['개방']);
    expect(result.report.missingTitles).toEqual([]);
  });
  it('reports missing items instead of calling an unrelated three-item answer complete', async () => {
    const generate = vi.fn(async (system, prompt, options) => options.stage.startsWith('details') ? { entries: [
      { title: '상위 분류', category: '설정', content: '요청 명단에 없는 다른 항목에 대한 충분히 긴 설명입니다.' },
    ] } : modelResponse(system, prompt, options));
    const result = await buildValidatedWorldBatch({ ...base, generate });
    expect(result.entries).toEqual([]);
    expect(result.report.missingTitles).toHaveLength(15);
    expect(result.report.warnings.join(' ')).toContain('완료된 생성으로 취급하지 않습니다');
    expect(generate.mock.calls.length).toBeLessThanOrEqual(14);
  });
  it('uses contextual review feedback to repair only a rejected entry, even without blacklist words', async () => {
    let detailAttempt = 0;
    const generate = vi.fn(async (_system: string, prompt: string, options: { stage: string }) => {
      if (options.stage.startsWith('roster')) return { groups: [{ label: '세가', expectedCount: 1, members: ['모용세가'] }] };
      if (options.stage === 'verify-roster') return { valid: true, expectedCount: 1, issues: [] };
      if (options.stage === 'review-descriptions') return { reviews: [{ title: '모용세가', verdict: detailAttempt === 1 ? 'revise' : 'accept', evidence: '흥행을 위한 편리한 장치로 소비된다.', reason: '실제 가문의 활동 대신 외부에서 이야기를 소비하는 관점을 설명했다.' }] };
      detailAttempt += 1;
      if (detailAttempt === 2) {
        expect(prompt).toContain('흥행을 위한 편리한 장치로 소비된다.');
        expect(prompt).toContain('실제 가문의 활동 대신');
      }
      return { entries: [{
        title: '모용세가', category: '세가', tags: ['세가'], sourceIds: [],
        content: detailAttempt === 1
          ? '모용세가는 요동의 교역로를 장악한 가문이다. 흥행을 위한 편리한 장치로 소비된다.'
          : '모용세가는 요동의 교역로를 장악한 무림 가문이다. 가문의 비전과 혈통을 엄격히 지키며 북방 세력과의 혼인 동맹으로 영향력을 넓혀 왔다.',
      }] };
    });
    const result = await buildValidatedWorldBatch({ ...base, instruction: '모용세가를 추가해줘', generate });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].content).toContain('요동의 교역로');
    expect(detailAttempt).toBe(2);
    expect(generate.mock.calls.find(([, , options]) => options.stage.startsWith('details'))?.[0]).toContain('현재 작품 세계에서 사실로 취급');
  });
  it('accepts in-world publishing language and retries only the entry the reviewer flagged', async () => {
    const publisher = '금서방은 소설을 필사해 파는 서점이다. 작가와 독자는 여기서 서로의 신분을 숨긴 채 금서를 거래한다.';
    const bad = '달의 사원은 눈에 띄는 외관으로 알려져 있다. 긴장감을 높일 때 손쉽게 활용할 수 있는 장치다.';
    let calls = 0;
    const generate = vi.fn(async (_system: string, prompt: string, options: { stage: string }) => {
      if (options.stage.startsWith('roster')) return { groups: [{ label: '장소', expectedCount: 2, members: ['금서방', '달의 사원'] }] };
      if (options.stage === 'verify-roster') return { valid: true, expectedCount: 2 };
      if (options.stage === 'review-descriptions') return { reviews: reviewedEntries(prompt).map(({ title, content }) => content === bad
        ? { title, verdict: 'revise', evidence: '긴장감을 높일 때 손쉽게 활용할 수 있는 장치다.', reason: '창작 조언으로 관점이 전환됐다.' }
        : { title, verdict: 'accept' }) };
      calls += 1;
      if (calls === 2) expect(prompt.match(/<targets>\n([\s\S]*?)\n<\/targets>/)?.[1]).not.toContain('금서방');
      return { entries: calls === 1
        ? [{ title: '금서방', category: '장소', content: publisher }, { title: '달의 사원', category: '장소', content: bad }]
        : [{ title: '달의 사원', category: '장소', content: '달의 사원은 눈에 띄는 외관으로 알려져 있다. 둥근 지붕 아래에는 밤마다 달빛이 모여든다.' }] };
    });
    const result = await buildValidatedWorldBatch({ ...base, instruction: '장소 두 개', generate });
    expect(result.entries.map(({ title }) => title)).toEqual(['금서방', '달의 사원']);
    expect(result.entries[0].content).toBe(publisher);
    expect(calls).toBe(2);
  });
  it('bounds failed semantic repairs and reports the missing entry', async () => {
    let detailCalls = 0;
    const content = '달의 사원은 긴장감을 높일 때 손쉽게 활용할 수 있는 장치다. 설명을 더 붙이면 된다.';
    const result = await buildValidatedWorldBatch({ ...base, instruction: '달의 사원 추가', generate: async (_system, _prompt, options) => {
      if (options.stage.startsWith('roster')) return { groups: [{ label: '장소', expectedCount: 1, members: ['달의 사원'] }] };
      if (options.stage === 'verify-roster') return { valid: true, expectedCount: 1 };
      if (options.stage === 'review-descriptions') return { reviews: [{ title: '달의 사원', verdict: 'revise', evidence: '설명을 더 붙이면 된다.', reason: '설정 대신 창작 조언을 반환했다.' }] };
      detailCalls += 1;
      return { entries: [{ title: '달의 사원', category: '장소', content }] };
    } });
    expect(detailCalls).toBe(2);
    expect(result.entries).toEqual([]);
    expect(result.report.missingTitles).toEqual(['달의 사원']);
    expect(result.report.warnings.join(' ')).toContain('서술 관점 검토');
  });
});
