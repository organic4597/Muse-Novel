import { formatPromptData } from '@/lib/ai/prompt-foundations';
import { hasOutOfWorldDescription, WORLD_ENTRY_IMMERSIVE_STYLE_PROMPT, WORLD_ROSTER_PROMPT, WORLD_ROSTER_REVIEW_PROMPT } from '@/lib/ai/world-prompts';
import { planWorldRequest, validateWorldRoster, type WorldBatchReport, worldTitleKey } from '@/lib/ai/world-request';
import { formatWebResearch } from '@/lib/web-research/research';
import type { WebResearch } from '@/lib/web-research/types';

export type WorldBatchEntry = { title: string; category: string; content: string; tags: string[]; sourceIds: string[] };
export type WorldBatchResult = { entries: WorldBatchEntry[]; report: WorldBatchReport; research: WebResearch };
export type WorldJsonGenerator = (system: string, prompt: string, options: { maxOutputTokens: number; stage: string }) => Promise<unknown>;

export async function buildValidatedWorldBatch(options: {
  instruction: string;
  existing: Array<{ title: string }>;
  pending: Array<{ title: string }>;
  context: string;
  categories: readonly string[];
  research: WebResearch;
  localReference?: string;
  taskSummary?: string;
  lookup?: () => Promise<WebResearch>;
  forceLookup?: boolean;
  signal?: AbortSignal;
  diagnostics: WorldBatchReport['diagnostics'];
  generate: WorldJsonGenerator;
}): Promise<WorldBatchResult> {
  const { instruction, signal, generate } = options;
  let research = options.research;
  let searched = research.status !== 'skipped';
  const plan = planWorldRequest(instruction);
  if (plan.countHint !== undefined && (plan.countHint < 1 || plan.countHint > 20)) throw new Error('한 번에 1~20개의 항목을 요청해주세요.');
  const warnings: string[] = [];
  const key = worldTitleKey;
  const rosterPrompt = () => [
    formatPromptData('request', instruction),
    formatPromptData('request_interpretation', options.taskSummary),
    formatPromptData('project_context', options.context),
    formatPromptData('internal_wiki', options.localReference),
    plan.countHint ? `사용자가 명시한 수량: 총 ${plan.countHint}개.` : '요청한 전체 구성인지 일부 예시인지 구분하고 개별 대상의 수량을 파악한다. 수량을 확인할 수 없으면 명단을 지어내지 않는다.',
    formatPromptData('existing_names', [...options.existing, ...options.pending].map((entry) => entry.title).join(', ').slice(0, 1800)),
    formatWebResearch(research, 1800),
    searched ? (research.status === 'skipped' ? '웹 검색이 꺼져 있다. 현재 자료로 확인할 수 없으면 그 이유를 명시한다.' : '웹 조회는 이미 시도했다. 현재 확보된 자료로 명단을 작성하거나, 불충분하면 그 이유를 명시한다.') : '현재 자료가 부족하면 needsSearch=true로 외부 조회를 요청한다.',
  ].join('\n\n');
  let roster: ReturnType<typeof validateWorldRoster> | undefined;
  let rosterError = '';
  if (options.forceLookup && options.lookup) { research = await options.lookup(); searched = true; }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    signal?.throwIfAborted();
    try {
      let raw = await generate(
        WORLD_ROSTER_PROMPT,
        `${rosterPrompt()}${rosterError ? `\n검증 오류를 고쳐 명단 전체를 다시 출력: ${rosterError}` : ''}`,
        { maxOutputTokens: 1400, stage: 'roster' }
      );
      if (raw && typeof raw === 'object' && (raw as { needsSearch?: boolean }).needsSearch === true && !searched && options.lookup) {
        research = await options.lookup(); searched = true;
        raw = await generate(WORLD_ROSTER_PROMPT, rosterPrompt(), { maxOutputTokens: 1400, stage: 'roster-after-lookup' });
      }
      const proposed = validateWorldRoster(raw, plan);
      const verification = await generate(
        WORLD_ROSTER_REVIEW_PROMPT,
        [formatPromptData('original_request', instruction), formatPromptData('project_context', options.context), formatPromptData('proposed_roster', JSON.stringify(raw)), formatPromptData('internal_wiki', options.localReference?.slice(0, 1200)), formatWebResearch(research, 1800)].join('\n\n'),
        { maxOutputTokens: 500, stage: 'verify-roster' }
      ) as { valid?: boolean; expectedCount?: number; issues?: unknown[] };
      if (verification?.valid !== true || verification.expectedCount !== proposed.length) {
        throw new Error(`요청 의미 검증 실패: ${(Array.isArray(verification?.issues) ? verification.issues : ['요청과 명단의 범위 또는 개수가 일치하지 않음']).join(' ').slice(0, 500)}`);
      }
      roster = proposed;
      break;
    } catch (error) { rosterError = error instanceof Error ? error.message : '명단 해석 실패'; }
  }
  if (!roster) throw new Error(`요청 명단을 검증하지 못해 후보를 저장하지 않았습니다. ${rosterError}`);
  const existingKeys = new Set(options.existing.map((entry) => key(entry.title)));
  const pendingKeys = new Set(options.pending.map((entry) => key(entry.title)));
  const existingTitles = roster.filter((entry) => existingKeys.has(key(entry.title))).map((entry) => entry.title);
  const pendingTitles = roster.filter((entry) => !existingKeys.has(key(entry.title)) && pendingKeys.has(key(entry.title))).map((entry) => entry.title);
  const targets = roster.filter((entry) => !existingKeys.has(key(entry.title)) && !pendingKeys.has(key(entry.title)));
  const entries: WorldBatchEntry[] = [];
  const detailSystem = [
    '지정 명단의 개별 세계관 항목만 작성한다. 명칭을 바꾸거나 상위 분류로 대체하지 않는다.',
    WORLD_ENTRY_IMMERSIVE_STYLE_PROMPT,
    `분류 선택지: ${options.categories.join(', ')}. 사용자 지정 분류를 우선하고, 지정하지 않았다면 대상의 성격에 맞는 분류를 쓴다.`,
    '검색 요약을 복사하거나 검색 제목·링크·JSON·출처 목록을 content에 넣지 않는다. 확인하지 못한 세부 설정을 만들어 단정하지 않는다.',
    'sourceIds에는 실제 해당 이름의 근거가 있는 자료 번호(웹1 등)만 넣고 없으면 빈 배열로 둔다.',
    'JSON만 출력: {"entries":[{"title":"지정 이름","category":"분류","content":"짧은 설명","tags":["태그"],"sourceIds":["웹1"]}]}',
  ].join('\n');

  const generateDetails = async (names: typeof targets) => {
    signal?.throwIfAborted();
    const raw = await generate(detailSystem, [
      formatPromptData('project_context', options.context.slice(0, 700)),
      formatPromptData('internal_wiki', options.localReference?.slice(0, 1000)),
      formatPromptData('author_request', instruction.slice(0, 1600)),
      formatWebResearch(research, 2300),
      // Keep changing targets after the shared prefix so inference servers can reuse prompt caches.
      formatPromptData('targets', JSON.stringify(names)),
      `entries에는 위의 ${names.length}개만 정확히 작성한다.`,
    ].join('\n\n'), { maxOutputTokens: 600 + names.length * 500, stage: `details:${names.map((entry) => entry.title).join(',')}` });
    const values = raw && typeof raw === 'object' ? (raw as { entries?: unknown }).entries : undefined;
    if (!Array.isArray(values)) throw new Error('설명 목록이 없습니다.');
    const allowed = new Map(names.map((entry) => [key(entry.title), entry.title]));
    for (const value of values) {
      if (!value || typeof value !== 'object' || typeof value.title !== 'string') continue;
      const expected = allowed.get(key(value.title));
      if (!expected || entries.some((entry) => key(entry.title) === key(expected))) continue;
      const content = typeof value.content === 'string' ? value.content.replace(/\[웹\d+\]/gu, '').trim() : '';
      const category = typeof value.category === 'string' ? value.category.trim() : '';
      if (!category || category.length > 100 || content.length < 30 || content.length > 2000 || hasOutOfWorldDescription(content) || /https?:\/\/|웹 참고 자료|^\s*[[{]/u.test(content)) continue;
      const sourceIds: string[] = (Array.isArray(value.sourceIds) ? value.sourceIds : []).filter((id: unknown): id is string => {
        if (typeof id !== 'string') return false;
        const source = research.sources.find((item) => item.id === id);
        const text = source ? `${source.title} ${source.snippet}`.replace(/\s+/g, '').toLocaleLowerCase('ko-KR') : '';
        const subject = key(expected);
        return Boolean(source && subject.length >= 2 && text.includes(subject));
      });
      const tags = (Array.isArray(value.tags) ? value.tags : []).filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 50).slice(0, 5);
      entries.push({ title: expected, category, content, tags, sourceIds: [...new Set(sourceIds)] });
    }
  };
  // Short, bounded completions plus one smaller retry pass; never parse a truncated JSON tail.
  for (let offset = 0; offset < targets.length; offset += 4) {
    const chunk = targets.slice(offset, offset + 4);
    if (signal?.aborted) { warnings.push('시간 제한 또는 취소로 일부 항목을 완성하지 못했습니다.'); break; }
    try { await generateDetails(chunk); } catch (error) { warnings.push(error instanceof Error ? error.message : '설명 생성 실패'); }
    const missing = chunk.filter((target) => !entries.some((entry) => key(entry.title) === key(target.title)));
    for (let retry = 0; retry < missing.length && !signal?.aborted; retry += 2) {
      try { await generateDetails(missing.slice(retry, retry + 2)); } catch (error) { warnings.push(error instanceof Error ? error.message : '누락 보완 실패'); }
    }
  }
  const missingTitles = targets.filter((target) => !entries.some((entry) => key(entry.title) === key(target.title))).map((entry) => entry.title);
  if (missingTitles.length) warnings.push(`${missingTitles.length}개 항목이 누락되었습니다. 완료된 생성으로 취급하지 않습니다.`);
  return { entries, research, report: {
    instruction, requestedCount: roster.length, expectedTitles: roster.map((entry) => entry.title),
    existingTitles, pendingTitles, generatedCount: entries.length, missingTitles,
    note: '요청과 자료를 바탕으로 정리하고 의미 검토를 거친 명단입니다. 승인 전에 작품에 맞는 구성을 확인하세요.',
    warnings: [...new Set(warnings)], diagnostics: options.diagnostics,
  } };
}
