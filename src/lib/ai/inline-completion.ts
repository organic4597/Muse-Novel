import { createHash } from 'node:crypto';
import { formatPromptData } from './prompt-foundations';

export type InlineCompletionInput = {
  prefix: string;
  suffix: string;
  storyContext?: string;
  styleDescription?: string | null;
  genre?: string | null;
  explicit?: boolean;
};

export type InlineContinuationMode =
  | 'continue_clause'
  | 'next_sentence'
  | 'bridge';

const MAX_SUGGESTION_CHARS = 180;
const META_PREFIX = /^(이어쓰기|이어질\s*문구|출력|응답|다음\s*문장|제안)\s*[:：-]\s*/i;
const META_TEXT = /(다음 문장|이어쓰기|요청하신|도와드리|AI|언어 모델|문맥상|추천 문구)/i;

export function getInlineContinuationMode(
  prefix: string,
  suffix: string
): InlineContinuationMode {
  if (suffix.trim()) return 'bridge';
  return /[.!?…。！？]["'”’」』)]*\s*$/u.test(prefix)
    ? 'next_sentence'
    : 'continue_clause';
}

function getContinuationInstruction(mode: InlineContinuationMode) {
  if (mode === 'continue_clause') {
    return '커서는 아직 끝나지 않은 문장 안에 있다. 새 문장이나 새 주어로 다시 시작하지 말고, 바로 앞 조사·어미·구문의 지배를 받는 문장 성분부터 이어서 현재 문장을 자연스럽게 완성한다.';
  }
  if (mode === 'bridge') {
    return '커서 뒤에 기존 원문이 있다. 앞 문맥에서 뒤 원문으로 이어지는 데 꼭 필요한 최소한의 구절만 쓰고, 뒤 원문의 첫 구절이나 사건을 미리 반복하지 않는다.';
  }
  return '커서는 완결된 문장 뒤에 있다. 직전 문장을 다른 말로 설명하지 말고, 같은 장면에서 그 행동의 즉각적인 결과·반응·감각 중 하나를 한 박자 전진시킨다.';
}

export function buildInlineCompletionSystemPrompt(
  input: InlineCompletionInput
): string {
  const continuationMode = getInlineContinuationMode(input.prefix, input.suffix);
  const parts = [
    '당신은 한국어 소설 편집기의 인라인 자동완성 엔진이다.',
    '목표: 작가가 쓰던 문장의 일부처럼 보이도록 커서 직전의 구문·주어·행동·호흡을 직접 이어 쓴다.',
    '선택 우선순위: ① 커서 바로 앞 구문의 문법적 결속 ② 직전 두 문장의 인과와 초점 ③ 시점·시제·인물 말투·문장 길이 ④ 장면의 작은 전진.',
    getContinuationInstruction(continuationMode),
    continuationMode === 'continue_clause'
      ? '출력은 보통 4~60자의 문장 나머지 부분으로 한다.'
      : '출력은 보통 12~90자의 한 문장 또는 짧은 연결 구절로 한다.',
    '본문만 출력한다. 설명, 제목, 목록, 따옴표 포장, 마크다운, 후보 번호, 인사말은 붙이지 않는다.',
    '이미 나온 주어와 정보를 불필요하게 다시 말하지 않는다. 장면을 요약하거나 설정에 없는 고유명사·사건·감정을 새로 만들지 않는다.',
    '문체를 멋대로 화려하게 바꾸지 말고, 바로 앞 원고의 어휘 수준과 문장 길이 편차를 따른다.',
    '출력 후보를 커서 직전 120자에 실제로 붙여 읽고 조사 호응, 수식 대상, 주어와 서술어가 하나의 문장으로 성립하는지 확인한다.',
    '답변 전에 앞 문장과의 중복 및 뒤 문장과의 문법 연결을 내부적으로 확인하되 과정은 출력하지 않는다.',
    input.suffix
      ? '커서 뒤 본문이 있으므로 그 문장과 문법적으로 자연스럽게 이어지며 뒤 본문을 반복하지 마라.'
      : '커서 뒤 본문이 없으므로 바로 다음에 올 자연스러운 진행만 제안하라.',
    input.explicit
      ? '사용자가 명시적으로 새 제안을 요청했으므로 이전과 다른 표현을 우선하라.'
      : '자동 제안이므로 확신이 낮으면 짧고 보수적인 표현을 선택하라.',
  ];

  if (input.genre) parts.push(formatPromptData('genre', input.genre));
  if (input.storyContext) {
    parts.push(formatPromptData('story_bible', input.storyContext));
  }
  if (input.styleDescription) {
    parts.push(formatPromptData('style_guide', input.styleDescription));
  }

  return parts.join('\n\n');
}

export function buildInlineCompletionUserPrompt(
  input: Pick<InlineCompletionInput, 'prefix' | 'suffix'>
): string {
  const continuationMode = getInlineContinuationMode(input.prefix, input.suffix);
  return [
    formatPromptData('manuscript_before_cursor', input.prefix),
    '<CURSOR>',
    formatPromptData('manuscript_after_cursor', input.suffix || '(없음)'),
    formatPromptData('cursor_mode', continuationMode),
    formatPromptData(
      'literal_join_check',
      `${input.prefix.slice(-120)}[출력은 이 위치부터 시작]${input.suffix.slice(0, 80)}`
    ),
    '',
    continuationMode === 'continue_clause'
      ? '마지막 문장을 처음부터 다시 쓰지 말고, 커서 바로 다음 글자부터 이어질 본문만 출력한다:'
      : '커서 바로 다음에 삽입할 본문만 출력한다:',
  ].join('\n');
}

export function buildCompletionStylePrompt(input: InlineCompletionInput): string {
  return [
    buildInlineCompletionSystemPrompt(input),
    '',
    buildInlineCompletionUserPrompt(input),
  ].join('\n');
}

function stripContextEcho(prefix: string, value: string): string {
  const normalizedPrefix = prefix.replace(/\s+/g, ' ').trimEnd();
  let result = value;
  const max = Math.min(160, normalizedPrefix.length, result.length);

  for (let size = max; size >= 2; size--) {
    const tail = normalizedPrefix.slice(-size);
    if (result.startsWith(tail)) {
      result = result.slice(size).trimStart();
      break;
    }
  }
  return result;
}

function stripSuffixEcho(suffix: string, value: string): string {
  const normalizedSuffix = suffix.replace(/\s+/g, ' ').trimStart();
  if (!normalizedSuffix) return value;

  const suffixFirst = normalizedSuffix[0];
  if (
    suffixFirst &&
    /[,.;:!?…。！？，、)\]」』]/.test(suffixFirst) &&
    value.endsWith(suffixFirst)
  ) {
    return value.slice(0, -1).trimEnd();
  }

  const max = Math.min(120, normalizedSuffix.length, value.length);
  for (let size = max; size >= 2; size--) {
    if (value.endsWith(normalizedSuffix.slice(0, size))) {
      return value.slice(0, -size).trimEnd();
    }
  }
  return value;
}

function hasExcessiveRepetition(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  return /(.{2,10})\1{2,}/.test(compact);
}

function ngramSimilarity(context: string, suggestion: string): number {
  const source = context.replace(/\s+/g, '').slice(-600);
  const target = suggestion.replace(/\s+/g, '');
  const size = 4;
  if (source.length < size || target.length < 12) return 0;

  const sourceGrams = new Set<string>();
  for (let index = 0; index <= source.length - size; index++) {
    sourceGrams.add(source.slice(index, index + size));
  }

  let shared = 0;
  const total = target.length - size + 1;
  for (let index = 0; index < total; index++) {
    if (sourceGrams.has(target.slice(index, index + size))) shared++;
  }
  return total > 0 ? shared / total : 0;
}

function takeUsefulLength(value: string): string {
  const sentences = value.match(/[^.!?…。！？]+[.!?…。！？](?:["'”’」』]*)?/g);
  if (sentences?.length) {
    const selected = sentences[0].trim();
    if (selected.length <= MAX_SUGGESTION_CHARS) return selected;
  }

  if (value.length <= MAX_SUGGESTION_CHARS) return value;
  const sliced = value.slice(0, MAX_SUGGESTION_CHARS + 1);
  const boundary = Math.max(
    sliced.lastIndexOf(' '),
    sliced.lastIndexOf('.'),
    sliced.lastIndexOf('。'),
    sliced.lastIndexOf('!'),
    sliced.lastIndexOf('?')
  );
  return sliced.slice(0, boundary >= 40 ? boundary + 1 : MAX_SUGGESTION_CHARS).trimEnd();
}

function addInsertionSpacing(prefix: string, value: string): string {
  if (!value || !prefix || /\s$/.test(prefix) || /^\s/.test(value)) return value;
  if (/^[,.;:!?…。！？，、)\]」』]/.test(value)) return value;
  return ` ${value}`;
}

export function normalizeInlineCompletion(
  rawText: string,
  input: Pick<InlineCompletionInput, 'prefix' | 'suffix'>
): string {
  let value = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[a-z]*\n?|```/gi, '')
    .replace(/^\s*[-*]\s+/, '')
    .replace(META_PREFIX, '')
    .replace(/^==|==$/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^["“”]+|["“”]+$/g, '')
    .trim();

  value = stripContextEcho(input.prefix, value);
  value = stripSuffixEcho(input.suffix, value);
  value = takeUsefulLength(value).trim();

  if (value.length < 3 || META_TEXT.test(value)) return '';
  if (hasExcessiveRepetition(value)) return '';
  if (ngramSimilarity(input.prefix, value) > 0.78) return '';
  if (input.suffix.trim()?.startsWith(value)) return '';

  return addInsertionSpacing(input.prefix, value);
}

type CacheEntry = { text: string; expiresAt: number };
const globalForInlineCache = globalThis as typeof globalThis & {
  __museInlineCompletionCache?: Map<string, CacheEntry>;
};
const inlineCompletionCache =
  globalForInlineCache.__museInlineCompletionCache ?? new Map<string, CacheEntry>();
globalForInlineCache.__museInlineCompletionCache = inlineCompletionCache;

export function getInlineCompletionCacheKey(parts: {
  providerId: string;
  projectId: string;
  chapterId?: string;
  prefix: string;
  suffix: string;
  context?: string;
}): string {
  return createHash('sha256')
    .update(
      [
        parts.providerId,
        parts.projectId,
        parts.chapterId ?? '',
        parts.prefix.slice(-3500),
        parts.suffix.slice(0, 1000),
        parts.context ?? '',
      ].join('\u0000')
    )
    .digest('hex');
}

export function getCachedInlineCompletion(key: string): string | null {
  const cached = inlineCompletionCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    inlineCompletionCache.delete(key);
    return null;
  }
  return cached.text;
}

export function cacheInlineCompletion(key: string, text: string): void {
  if (inlineCompletionCache.size >= 200) {
    const oldestKey = inlineCompletionCache.keys().next().value;
    if (oldestKey) inlineCompletionCache.delete(oldestKey);
  }
  inlineCompletionCache.set(key, {
    text,
    expiresAt: Date.now() + 2 * 60_000,
  });
}
