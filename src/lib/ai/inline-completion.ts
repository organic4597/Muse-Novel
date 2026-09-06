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

const MAX_SUGGESTION_CHARS = 180;
const META_PREFIX = /^(이어쓰기|이어질\s*문구|출력|응답|다음\s*문장|제안)\s*[:：-]\s*/i;
const META_TEXT = /(다음 문장|이어쓰기|요청하신|도와드리|AI|언어 모델|문맥상|추천 문구)/i;

export function buildInlineCompletionSystemPrompt(
  input: InlineCompletionInput
): string {
  const parts = [
    '당신은 한국어 소설 편집기의 인라인 자동완성 엔진이다.',
    '목표: 독자가 이미 읽던 본문의 커서 위치에 바로 삽입할 짧고 자연스러운 소설 본문을 작성한다.',
    '선택 우선순위: ① 앞뒤 문장의 문법적 연결 ② 장면의 인과와 인물 행동 ③ 시점·시제·어조·호흡 ④ 표현의 신선함.',
    '출력은 자연스러운 한 문장 또는 한 절, 12~100자 정도로 한다.',
    '본문만 출력한다. 설명, 제목, 목록, 따옴표 포장, 마크다운, 후보 번호, 인사말은 붙이지 않는다.',
    '직전 표현을 되풀이하거나 장면을 요약하지 않고, 설정에 없는 고유명사와 갑작스러운 장면 전환은 만들지 않는다.',
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
  return [
    formatPromptData('prefix', input.prefix),
    '<CURSOR>',
    formatPromptData('suffix', input.suffix || '(없음)'),
    '',
    '커서에 삽입할 본문만 출력한다:',
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

  for (let size = max; size >= 4; size--) {
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
    const selected = sentences.slice(0, 2).join(' ').trim();
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
