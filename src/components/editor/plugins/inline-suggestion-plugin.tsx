'use client';

import {
  bindFirst,
  NodeApi,
  PathApi,
  type PluginConfig,
  type TRange,
  TextApi,
} from 'platejs';
import {
  createTPlatePlugin,
  getEditorPlugin,
  type OverrideEditor,
  type PlateEditor,
  PlateLeaf,
  type PlateLeafProps,
  useFocused,
  usePluginOption,
} from 'platejs/react';
import {
  getGhostTextTuning,
  recordGhostTextMetric,
} from '@/lib/client/ghost-text-metrics';
import { MarkdownKit } from './markdown-kit';

export type InlineSuggestionConfig = PluginConfig<
  'inlineSuggestion',
  {
    suggestionText: string | null;
    suggestionNodeId: string | null;
    suggestionPoint: { offset: number; path: number[] } | null;
    abortController: AbortController | null;
    isAccepting: boolean;
    isLoading: boolean;
    requestStatus: 'idle' | 'loading' | 'success' | 'empty' | 'model_busy' | 'timeout';
    suggestionCandidateIndex: number;
    suggestionCandidates: string[];
    chapterId: string | null;
    enabled: boolean;
  },
  {
    inlineSuggestion: {
      setSuggestion: (text: string, nodeId?: string) => void;
      cycleCandidate: (direction: -1 | 1) => boolean;
      clearSuggestion: () => void;
    };
  },
  {
    inlineSuggestion: {
      accept: (wordOnly?: boolean) => boolean;
    };
  },
  {
    isSuggested: (id: string) => boolean;
  }
>;

const NON_SPACE_REGEX = /^\s*(\S)/;
const TOKEN_MATCH_REGEX = /^(\s*\S+[\u3000-\u303F\uFF00-\uFFEF.,!?…]*)/;
const PROJECT_PATH_REGEX = /\/projects\/([^/]+)/;
const COPILOT_AUTOMATIC_PREFIX_CHAR_LIMIT = 1600;
const COPILOT_AUTOMATIC_SUFFIX_CHAR_LIMIT = 400;
const COPILOT_EXPLICIT_PREFIX_CHAR_LIMIT = 6000;
const COPILOT_EXPLICIT_SUFFIX_CHAR_LIMIT = 1500;
const COPILOT_AUTOMATIC_TIMEOUT_MS = 4000;
const COPILOT_EXPLICIT_TIMEOUT_MS = 15000;
const COPILOT_AUTOMATIC_COOLDOWN_MS = 2000;
const COPILOT_SENTENCE_CHAR_LIMIT = 120;

function parseBracketedSuggestion(text: string): string {
  const bracketPatterns = [
    /==([^=\n]+)==/,
    /\[([^[\]\n]+)\]/,
    /\(([^()\n]+)\)/,
    /「([^「」\n]+)」/,
    /『([^『』\n]+)』/,
  ];

  for (const pattern of bracketPatterns) {
    const extracted = text.match(pattern)?.[1]?.trim();

    if (extracted) {
      return extracted;
    }
  }

  return '';
}

function extractRawSuggestion(text: string): string {
  const normalized = text
    .replace(/\r/g, '')
    .replace(/==/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return '';
  }

  const firstLine = normalized[0]
    .replace(/^(이어쓰기|이어질문구|출력|응답|다음문장)\s*[:：-]\s*/i, '')
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, '')
    .trim();

  return firstLine;
}

function hasRepetitivePattern(text: string): boolean {
  const normalized = text.replace(/\s+/g, '');

  return /(.{2,6})\1{1,}/.test(normalized);
}

function extractSuggestionFromCompletion(text: string): string {
  return parseBracketedSuggestion(text) || extractRawSuggestion(text);
}

function sanitizeSuggestionText(text: string): string {
  const hasLeadingSpace = /^\s/.test(text);
  const normalized = text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return hasLeadingSpace && normalized ? ` ${normalized}` : normalized;
}

function takeSentenceSuggestion(text: string): string {
  const normalized = sanitizeSuggestionText(text);

  if (!normalized) {
    return '';
  }

  const sentenceMatch = normalized.match(/^(.+?[.!?…。！？](?:["'”’」』]*)?)/);
  const sentence = sentenceMatch?.[1]?.trim() ?? normalized;

  return sentence.length > COPILOT_SENTENCE_CHAR_LIMIT
    ? sentence.slice(0, COPILOT_SENTENCE_CHAR_LIMIT).trimEnd()
    : sentence;
}
function extractSentenceCandidates(text: string): string[] {
  const sanitized = sanitizeSuggestionText(text);
  if (!sanitized) return [];

  const parts = sanitized.split(/(?<=[.!?…。！？](?:["'"'」』]*)?)\s+/);
  const candidates: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length >= 4) {
      candidates.push(
        trimmed.length > COPILOT_SENTENCE_CHAR_LIMIT
          ? trimmed.slice(0, COPILOT_SENTENCE_CHAR_LIMIT).trimEnd()
          : trimmed
      );
    }
  }
  return candidates.length > 0 ? candidates : (sanitized.length >= 4 ? [sanitized.slice(0, COPILOT_SENTENCE_CHAR_LIMIT)] : []);
}
function trimContextEcho(context: string, suggestion: string): string {
  const normalizedContext = sanitizeSuggestionText(context);
  let trimmed = sanitizeSuggestionText(suggestion);

  const maxDirectOverlap = Math.min(normalizedContext.length, trimmed.length);

  for (let size = maxDirectOverlap; size >= 2; size--) {
    const prefix = trimmed.slice(0, size);

    if (normalizedContext.endsWith(prefix)) {
      trimmed = trimmed.slice(size).trimStart();
      break;
    }
  }

  const maxEmbeddedOverlap = Math.min(normalizedContext.length, 16);
  const leadingDecorationMatch = trimmed.match(/^["'“”‘’「『([]+/);
  const leadingDecoration = leadingDecorationMatch?.[0] ?? '';
  const undecorated = trimmed.slice(leadingDecoration.length);

  for (let size = maxEmbeddedOverlap; size >= 3; size--) {
    const suffix = normalizedContext.slice(-size);
    const position = undecorated.indexOf(suffix);

    if (position === 0) {
      trimmed = `${leadingDecoration}${undecorated.slice(size)}`.trimStart();
      break;
    }
  }

  return trimmed;
}

function hasMeaningfulSuggestionText(text: string): boolean {
  const normalized = sanitizeSuggestionText(text)
    .replace(/^["'“”‘’「『([]+/, '')
    .replace(/[.!?…。！？"'”’」』)\]]+$/g, '')
    .replace(/\s+/g, '');

  return normalized.length >= 3;
}

function isTooSimilarToContext(context: string, suggestion: string): boolean {
  const normalizedContext = sanitizeSuggestionText(context).replace(/\s+/g, '');
  const normalizedSuggestion = sanitizeSuggestionText(suggestion).replace(/\s+/g, '');

  if (!normalizedSuggestion) {
    return true;
  }

  if (normalizedContext.endsWith(normalizedSuggestion)) {
    return true;
  }

  if (normalizedSuggestion.length >= 4 && normalizedContext.includes(normalizedSuggestion)) {
    return true;
  }

  // Check shared n-gram overlap: if the suggestion reuses too many
  // character sequences from the context, it's likely an echo.
  const NGRAM_SIZE = 4;
  if (normalizedSuggestion.length >= 12 && normalizedContext.length >= NGRAM_SIZE) {
    const contextNgrams = new Set<string>();
    for (let i = 0; i <= normalizedContext.length - NGRAM_SIZE; i++) {
      contextNgrams.add(normalizedContext.slice(i, i + NGRAM_SIZE));
    }
    let shared = 0;
    const total = normalizedSuggestion.length - NGRAM_SIZE + 1;
    for (let i = 0; i < total; i++) {
      if (contextNgrams.has(normalizedSuggestion.slice(i, i + NGRAM_SIZE))) {
        shared++;
      }
    }
    if (total > 0 && shared / total > 0.78) {
      return true;
    }
  }

  const recentTail = normalizedContext.slice(-Math.max(normalizedSuggestion.length + 8, 24));
  let overlap = 0;
  const maxOverlap = Math.min(recentTail.length, normalizedSuggestion.length);

  for (let size = maxOverlap; size >= 2; size--) {
    if (recentTail.endsWith(normalizedSuggestion.slice(0, size))) {
      overlap = size;
      break;
    }
  }

  return overlap >= Math.max(2, Math.floor(normalizedSuggestion.length * 0.7));
}

function getSuggestionQualityScore(context: string, suggestion: string): number {
  const normalizedSuggestion = sanitizeSuggestionText(suggestion);

  if (!normalizedSuggestion) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = normalizedSuggestion.length;

  if (hasRepetitivePattern(normalizedSuggestion)) {
    score -= 100;
  }

  if (isTooSimilarToContext(context, normalizedSuggestion)) {
    score -= 25;
  }

  return score;
}

function getCurrentBlockId(editor: PlateEditor): string | null {
  const blockEntry = editor.api.block({ highest: true });
  if (!blockEntry) {
    return null;
  }

  const [block] = blockEntry;
  if (typeof block !== 'object' || block === null || !('id' in block)) {
    return null;
  }

  const id = (block as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

export function getCursorAwareContext(
  editor: PlateEditor,
  selection: TRange | null = editor.selection
): {
  prefix: string;
  suffix: string;
  currentBlockPrefix: string;
  currentBlockSuffix: string;
} | null {
  if (!selection || selection.anchor.path.join('.') !== selection.focus.path.join('.') || selection.anchor.offset !== selection.focus.offset) return null;

  const blockEntry = editor.api.block({ highest: true });
  if (!blockEntry) return null;
  const [, blockPath] = blockEntry;
  const blockIndex = blockPath[0];
  if (typeof blockIndex !== 'number') return null;

  const focus = selection.focus;
  const blockStart = editor.api.start(blockPath);
  const blockEnd = editor.api.end(blockPath);
  if (!blockStart || !blockEnd) return null;
  const currentBlockPrefix = editor.api.string(
    editor.api.range(blockStart, focus)
  );
  const currentBlockSuffix = editor.api.string(
    editor.api.range(focus, blockEnd)
  );

  const previousBlocks = editor.children
    .slice(0, blockIndex)
    .map((node) => NodeApi.string(node))
    .filter(Boolean);
  const nextBlocks = editor.children
    .slice(blockIndex + 1)
    .map((node) => NodeApi.string(node))
    .filter(Boolean);

  const prefix = [...previousBlocks, currentBlockPrefix]
    .filter(Boolean)
    .join('\n\n')
    .slice(-COPILOT_EXPLICIT_PREFIX_CHAR_LIMIT);
  const suffix = [currentBlockSuffix, ...nextBlocks]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, COPILOT_EXPLICIT_SUFFIX_CHAR_LIMIT);

  return { prefix, suffix, currentBlockPrefix, currentBlockSuffix };
}

function shouldTriggerAutomatically(context: {
  prefix: string;
  suffix: string;
  currentBlockPrefix: string;
  currentBlockSuffix: string;
}): boolean {
  if (context.prefix.trim().length < 20) return false;
  if (/[[（(「『]$/.test(context.currentBlockPrefix.trimEnd())) return false;

  // Automatic requests are expensive on a single-slot local model. Wait until
  // the author reaches a word or sentence boundary instead of firing whenever
  // they pause in the middle of a Korean word.
  if (!/[\s.!?…。！？，,;:："”’」』)]$/u.test(context.currentBlockPrefix)) {
    return false;
  }

  // In the middle of existing text, wait for an actual word/sentence boundary
  // to avoid inserting a completion inside a word.
  if (
    context.currentBlockSuffix &&
    !/[\s.!?…。！？，,;:："”’」』)]$/.test(context.currentBlockPrefix)
  ) {
    return false;
  }

  return true;
}

function getNextSuggestionChunk(text: string): {
  chunk: string;
  remainingText: string;
} {
  if (!text) {
    return { chunk: '', remainingText: '' };
  }

  const nonSpaceMatch = NON_SPACE_REGEX.exec(text);

  if (!nonSpaceMatch) {
    return { chunk: '', remainingText: '' };
  }

  const match = TOKEN_MATCH_REGEX.exec(text);

  if (!match) {
    return { chunk: text, remainingText: '' };
  }

  const chunk = match[0];

  return { chunk, remainingText: text.slice(chunk.length) };
}

function splitSuggestionByWordCount(
  text: string,
  wordCount: number
): { accepted: string; pending: string } {
  if (wordCount <= 0) return { accepted: '', pending: text };

  let remaining = text;
  let accepted = '';

  for (let i = 0; i < wordCount; i++) {
    const { chunk, remainingText } = getNextSuggestionChunk(remaining);

    if (!chunk) break;

    accepted += chunk;
    remaining = remainingText;
  }

  return { accepted, pending: remaining };
}

function acceptSuggestion(editor: PlateEditor, wordOnly = false) {
  const { api, getOptions, setOptions } = getEditorPlugin<InlineSuggestionConfig>(editor, {
    key: 'inlineSuggestion',
  });
  const { suggestionText } = getOptions();
  const normalizedSuggestion = suggestionText
    ? sanitizeSuggestionText(suggestionText)
    : null;

  if (!normalizedSuggestion?.length) return false;

  if (wordOnly) {
    const { chunk, remainingText } = getNextSuggestionChunk(
      normalizedSuggestion
    );
    if (!chunk) return false;

    const projectId = getProjectIdFromLocation();
    if (projectId) recordGhostTextMetric(projectId, 'word_accepted');

    setOptions({ isAccepting: true });
    editor.tf.insertText(chunk);
    setOptions({ isAccepting: false });

    if (remainingText) {
      api.inlineSuggestion.setSuggestion(
        remainingText,
        getCurrentBlockId(editor) ?? undefined
      );
    } else {
      setOptions({ suggestionText: null });
      api.inlineSuggestion.clearSuggestion();
      triggerCompletion(editor);
    }
    return true;
  }

  const projectId = getProjectIdFromLocation();
  if (projectId) recordGhostTextMetric(projectId, 'full_accepted');
  setOptions({ isAccepting: true });
  editor.tf.insertText(normalizedSuggestion);
  setOptions({ isAccepting: false, suggestionText: null });
  api.inlineSuggestion.clearSuggestion();
  triggerCompletion(editor);
  return true;
}

const withInlineSuggestion: OverrideEditor<InlineSuggestionConfig> = ({
  api,
  editor,
  getOptions,
  setOptions,
  tf: { apply, insertText },
}) => ({
  transforms: {
    apply(operation) {
      const { suggestionText, isAccepting } = getOptions();

      if (
        suggestionText &&
        !isAccepting &&
        (operation.type === 'insert_text' ||
          operation.type === 'remove_text' ||
          operation.type === 'split_node')
      ) {
        getOptions().abortController?.abort();
        api.inlineSuggestion.clearSuggestion();
      }

      apply(operation);
    },

    insertText(text, options) {
      const { suggestionText } = getOptions();

      if (suggestionText?.startsWith(text)) {
        const remaining = suggestionText.slice(text.length);
        setOptions({ isAccepting: true });
        insertText(text, options);
        setOptions({ isAccepting: false });
        if (remaining) {
          api.inlineSuggestion.setSuggestion(
            remaining,
            getCurrentBlockId(editor) ?? undefined
          );
        } else {
          setOptions({ suggestionText: null });
          api.inlineSuggestion.clearSuggestion();
        }
        return;
      }

      insertText(text, options);
    },
  },
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeRequestId = 0;
let lastAutomaticRequestAt = 0;
const clientCompletionCache = new Map<
  string,
  { text: string; expiresAt: number }
>();
const explicitCandidateCache = new Map<string, string[]>();

function rememberExplicitCandidate(cacheKey: string, text: string): string[] {
  const current = explicitCandidateCache.get(cacheKey) ?? [];
  const candidates = [...current.filter((candidate) => candidate !== text), text].slice(-3);
  if (explicitCandidateCache.size >= 20 && !explicitCandidateCache.has(cacheKey)) {
    const oldest = explicitCandidateCache.keys().next().value;
    if (oldest) explicitCandidateCache.delete(oldest);
  }
  explicitCandidateCache.set(cacheKey, candidates);
  return candidates;
}

export function getNextCandidateIndex(
  currentIndex: number,
  candidateCount: number,
  direction: -1 | 1
): number {
  if (candidateCount < 1) return 0;
  return (currentIndex + direction + candidateCount) % candidateCount;
}

export function getAutomaticRequestDelay(
  now: number,
  lastRequestAt: number,
  debounceMs: number
): number {
  const cooldownRemaining = Math.max(
    0,
    COPILOT_AUTOMATIC_COOLDOWN_MS - (now - lastRequestAt)
  );
  return Math.max(debounceMs, cooldownRemaining);
}

function getClientCacheKey(
  chapterId: string | null,
  prefix: string,
  suffix: string,
  explicit = false
): string {
  const prefixLimit = explicit
    ? COPILOT_EXPLICIT_PREFIX_CHAR_LIMIT
    : COPILOT_AUTOMATIC_PREFIX_CHAR_LIMIT;
  const suffixLimit = explicit
    ? COPILOT_EXPLICIT_SUFFIX_CHAR_LIMIT
    : COPILOT_AUTOMATIC_SUFFIX_CHAR_LIMIT;
  return [
    chapterId ?? '',
    prefix.slice(-prefixLimit),
    suffix.slice(0, suffixLimit),
  ].join('\u0000');
}

function getProjectIdFromLocation(): string | undefined {
  return typeof window === 'undefined'
    ? undefined
    : window.location.pathname.match(PROJECT_PATH_REGEX)?.[1];
}

/**
 * Run a single completion request and show the result as ghost text.
 * Used by both the debounced onChange trigger and the ArrowUp regenerate key.
 */
const runCompletion = async (
  editor: PlateEditor,
  options: { explicit?: boolean; temperature?: number } = {}
) => {
  if (!editor.api.isCollapsed() || editor.api.isComposing()) return;

  const { getOptions, api, setOptions } =
    getEditorPlugin<InlineSuggestionConfig>(editor, {
      key: 'inlineSuggestion',
    });

  const { chapterId, enabled } = getOptions();
  if (!enabled) return;
  const currentBlockId = getCurrentBlockId(editor);
  if (!currentBlockId) return;

  const context = getCursorAwareContext(editor);
  if (!context) return;
  if (!options.explicit && !shouldTriggerAutomatically(context)) return;

  const prefixLimit = options.explicit
    ? COPILOT_EXPLICIT_PREFIX_CHAR_LIMIT
    : COPILOT_AUTOMATIC_PREFIX_CHAR_LIMIT;
  const suffixLimit = options.explicit
    ? COPILOT_EXPLICIT_SUFFIX_CHAR_LIMIT
    : COPILOT_AUTOMATIC_SUFFIX_CHAR_LIMIT;
  const requestPrefix = context.prefix.slice(-prefixLimit);
  const requestSuffix = context.suffix.slice(0, suffixLimit);

  const cacheKey = getClientCacheKey(
    chapterId,
    requestPrefix,
    requestSuffix,
    Boolean(options.explicit)
  );
  const projectId = getProjectIdFromLocation();
  if (!projectId) return;
  if (!options.explicit) {
    const cached = clientCompletionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setOptions({
        suggestionCandidateIndex: 0,
        suggestionCandidates: [cached.text],
      });
      api.inlineSuggestion.setSuggestion(cached.text, currentBlockId);
      recordGhostTextMetric(projectId, 'automatic_shown', 0);
      return;
    }
    if (cached) clientCompletionCache.delete(cacheKey);
  }

  getOptions().abortController?.abort();

  const abortController = new AbortController();
  const requestId = ++activeRequestId;
  let timedOut = false;
  const timeoutMs = options.explicit
    ? COPILOT_EXPLICIT_TIMEOUT_MS
    : COPILOT_AUTOMATIC_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, timeoutMs);
  setOptions({
    abortController,
    isLoading: true,
    requestStatus: 'loading',
    suggestionNodeId: currentBlockId,
    suggestionPoint: editor.selection
      ? {
          offset: editor.selection.focus.offset,
          path: [...editor.selection.focus.path],
        }
      : null,
  });
  editor.api.redecorate();

  try {
    const requestStartedAt = Date.now();
    if (!options.explicit) lastAutomaticRequestAt = requestStartedAt;
    const res = await fetch('/api/ai/copilot', {
      body: JSON.stringify({
        mode: 'inline-suggestion',
        maxOutputTokens: options.explicit ? 96 : 48,
        projectId,
        chapterId,
        prompt: requestPrefix,
        prefix: requestPrefix,
        suffix: requestSuffix,
        trigger: options.explicit ? 'explicit' : 'automatic',
        temperature: options.temperature,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: abortController.signal,
    });

    if (requestId !== activeRequestId) return;
    if (!res.ok) {
      const outcome = res.status === 408 ? 'timeout' : 'empty';
      setOptions({ requestStatus: outcome });
      recordGhostTextMetric(projectId, outcome, Date.now() - requestStartedAt);
      console.warn('[ghost] response not ok:', res.status);
      return;
    }

    const data = (await res.json()) as {
      skipped?: 'model_busy';
      text?: string;
    };
    const completion = data.text;

    if (data.skipped === 'model_busy') {
      setOptions({ requestStatus: 'model_busy' });
      recordGhostTextMetric(
        projectId,
        'model_busy',
        Date.now() - requestStartedAt
      );
      return;
    }
    if (!completion || completion === '0') {
      setOptions({ requestStatus: 'empty' });
      recordGhostTextMetric(projectId, 'empty', Date.now() - requestStartedAt);
      return;
    }

    const latestContext = getCursorAwareContext(editor);
    if (
      !latestContext ||
      getClientCacheKey(
        chapterId,
        latestContext.prefix,
        latestContext.suffix,
        Boolean(options.explicit)
      ) !== cacheKey
    ) {
      return;
    }

    const suggestion = trimContextEcho(context.prefix, completion);
    const normalizedSuggestion = sanitizeSuggestionText(suggestion);
    if (!hasMeaningfulSuggestionText(normalizedSuggestion)) return;
    if (isTooSimilarToContext(context.prefix, normalizedSuggestion)) return;

    if (!options.explicit) {
      if (clientCompletionCache.size >= 50) {
        const oldest = clientCompletionCache.keys().next().value;
        if (oldest) clientCompletionCache.delete(oldest);
      }
      clientCompletionCache.set(cacheKey, {
        text: normalizedSuggestion,
        expiresAt: Date.now() + 2 * 60_000,
      });
    }
    const candidates = options.explicit
      ? rememberExplicitCandidate(cacheKey, normalizedSuggestion)
      : [normalizedSuggestion];
    setOptions({
      requestStatus: 'success',
      suggestionCandidateIndex: candidates.length - 1,
      suggestionCandidates: candidates,
    });
    api.inlineSuggestion.setSuggestion(normalizedSuggestion, currentBlockId);
    recordGhostTextMetric(
      projectId,
      options.explicit ? 'explicit_shown' : 'automatic_shown',
      Date.now() - requestStartedAt
    );
  } catch {
    if (timedOut && requestId === activeRequestId) {
      setOptions({ requestStatus: 'timeout' });
      recordGhostTextMetric(projectId, 'timeout', timeoutMs);
    }
  } finally {
    clearTimeout(timeoutId);
    if (requestId === activeRequestId) {
      setOptions({ abortController: null, isLoading: false });
      editor.api.redecorate();
    }
  }
};

const triggerCompletion = (editor: PlateEditor, explicit = false) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (explicit) {
    void runCompletion(editor, { explicit: true, temperature: 0.55 });
    return;
  }
  const projectId = getProjectIdFromLocation();
  const debounceMs = projectId
    ? getGhostTextTuning(projectId).debounceMs
    : 350;
  debounceTimer = setTimeout(
    () => runCompletion(editor, { temperature: 0.25 }),
    getAutomaticRequestDelay(Date.now(), lastAutomaticRequestAt, debounceMs)
  );
};

export const InlineSuggestionPlugin =
  createTPlatePlugin<InlineSuggestionConfig>({
    key: 'inlineSuggestion',
    decorate: ({ editor, entry }) => {
      const { getOptions } = getEditorPlugin<InlineSuggestionConfig>(editor, {
        key: 'inlineSuggestion',
      });
      const { enabled, isLoading, suggestionPoint, suggestionText } = getOptions();
      const [node, path] = entry;

      if (
        !enabled ||
        (!suggestionText && !isLoading) ||
        !suggestionPoint ||
        !TextApi.isText(node) ||
        !PathApi.equals(path, suggestionPoint.path)
      ) {
        return;
      }

      const offset = Math.min(suggestionPoint.offset, node.text.length);
      const renderBefore = offset === 0;
      const anchorOffset = renderBefore ? 0 : offset - 1;
      const focusOffset = renderBefore ? Math.min(1, node.text.length) : offset;

      return [
        {
          anchor: { offset: anchorOffset, path },
          focus: { offset: focusOffset, path },
          inlineSuggestion: true,
          inlineSuggestionPosition: renderBefore ? 'before' : 'after',
        },
      ];
    },
    node: { isLeaf: true },
    options: {
      abortController: null,
      chapterId: null,
      enabled: true,
      isAccepting: false,
      isLoading: false,
      requestStatus: 'idle',
      suggestionCandidateIndex: 0,
      suggestionCandidates: [],
      suggestionNodeId: null,
      suggestionPoint: null,
      suggestionText: null,
    },
    handlers: {
      onBlur: ({ api }) => {
        api.inlineSuggestion.clearSuggestion();
      },
      onChange: ({ api, editor, getOptions }) => {
        const { enabled, suggestionPoint, suggestionText, isLoading } = getOptions();
        if (!enabled) {
          if (suggestionText || isLoading) api.inlineSuggestion.clearSuggestion();
          return;
        }
        if (suggestionText) {
          const focus = editor.selection?.focus;
          if (
            !focus ||
            !suggestionPoint ||
            focus.offset !== suggestionPoint.offset ||
            !PathApi.equals(focus.path, suggestionPoint.path)
          ) {
            api.inlineSuggestion.clearSuggestion();
          }
          return;
        }
        // Don't trigger while a suggestion is visible or a request is in flight
        if (isLoading || editor.api.isComposing()) return;
        triggerCompletion(editor);
      },
      onKeyDown: ({ editor, event, getOptions }) => {
        const { enabled, suggestionText } = getOptions();
        if (!enabled) return;

        if (
          event.code === 'Space' &&
          event.ctrlKey &&
          event.altKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          event.stopPropagation();
          getOptions().abortController?.abort();
          const { api } = getEditorPlugin<InlineSuggestionConfig>(editor, {
            key: 'inlineSuggestion',
          });
          api.inlineSuggestion.clearSuggestion();
          triggerCompletion(editor, true);
          return true;
        }

        if (!suggestionText?.length) return;

        if (
          event.altKey &&
          !event.ctrlKey &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
          const { api } = getEditorPlugin<InlineSuggestionConfig>(editor, {
            key: 'inlineSuggestion',
          });
          if (api.inlineSuggestion.cycleCandidate(event.key === 'ArrowUp' ? -1 : 1)) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
        }

        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation?.();
          acceptSuggestion(editor);
          return true;
        }

        if (event.key === 'ArrowRight' && event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation?.();
          acceptSuggestion(editor, true);
          return true;
        }

        if (event.key.toLowerCase() === 'r' && event.altKey) {
          const { api: _api } = getEditorPlugin<InlineSuggestionConfig>(editor, { key: 'inlineSuggestion' });
          _api.inlineSuggestion.clearSuggestion();
          void runCompletion(editor, { explicit: true, temperature: 0.65 });
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      },
      onMouseDown: ({ api }) => {
        api.inlineSuggestion.clearSuggestion();
      },
    },
  })
    .extendSelectors(({ getOptions }) => ({
      isSuggested: (id: string) => getOptions().suggestionNodeId === id,
    }))
    .extendApi(({ editor, getOptions, setOptions }) => ({
      clearSuggestion: () => {
        const hadSuggestion = Boolean(getOptions().suggestionText);
        const projectId = getProjectIdFromLocation();
        if (hadSuggestion && projectId) {
          recordGhostTextMetric(projectId, 'dismissed');
        }
        getOptions().abortController?.abort();
        activeRequestId++;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        setOptions({
          abortController: null,
          isLoading: false,
          requestStatus: 'idle',
          suggestionCandidateIndex: 0,
          suggestionCandidates: [],
          suggestionNodeId: null,
          suggestionPoint: null,
          suggestionText: null,
        });
        editor.api.redecorate();
      },
      setSuggestion: (text: string, nodeId?: string) => {
        if (!getOptions().enabled) return;
        setOptions({
          isLoading: false,
          requestStatus: 'success',
          suggestionNodeId: nodeId ?? null,
          suggestionPoint: editor.selection
            ? {
                offset: editor.selection.focus.offset,
                path: [...editor.selection.focus.path],
              }
            : null,
          suggestionText: text,
        });
        editor.api.redecorate();
      },
      cycleCandidate: (direction: -1 | 1) => {
        const { suggestionCandidateIndex, suggestionCandidates } = getOptions();
        if (suggestionCandidates.length < 2) return false;
        const nextIndex = getNextCandidateIndex(
          suggestionCandidateIndex,
          suggestionCandidates.length,
          direction
        );
        setOptions({
          suggestionCandidateIndex: nextIndex,
          suggestionText: suggestionCandidates[nextIndex],
        });
        editor.api.redecorate();
        return true;
      },
    }))
    .extendTransforms(({ editor }) => ({
      accept: bindFirst(acceptSuggestion, editor),
    }))
    .overrideEditor(withInlineSuggestion)
    .extend({
      render: { node: InlineSuggestionLeaf },
      shortcuts: {
        clearSuggestion: { keys: 'escape' },
      },
    });

export const InlineSuggestionKit = [
  ...MarkdownKit,
  InlineSuggestionPlugin,
];

export function InlineSuggestionLeaf(props: PlateLeafProps) {
  const focused = useFocused();
  const position = (
    props.leaf as { inlineSuggestionPosition?: 'after' | 'before' }
  ).inlineSuggestionPosition;
  const ghost = focused ? <InlineGhostTextContent /> : null;

  return (
    <PlateLeaf {...props}>
      {position === 'before' && ghost}
      {props.children}
      {position === 'after' && ghost}
    </PlateLeaf>
  );
}

function InlineGhostTextContent() {
  const isLoading = usePluginOption(InlineSuggestionPlugin, 'isLoading');
  const text = usePluginOption(InlineSuggestionPlugin, 'suggestionText');
  const candidateIndex = usePluginOption(
    InlineSuggestionPlugin,
    'suggestionCandidateIndex'
  );
  const candidates = usePluginOption(InlineSuggestionPlugin, 'suggestionCandidates');

  if (isLoading && !text) {
    return (
      <span
        className="pointer-events-none inline-flex items-center gap-2 text-muted-foreground/50 max-sm:hidden"
        contentEditable={false}
      >
        <span className="inline-block size-2 animate-pulse rounded-full bg-current" />
      </span>
    );
  }

  if (!text) return null;

  return (
    <span
      className="pointer-events-none max-sm:hidden"
      contentEditable={false}
    >
      <span className="text-muted-foreground/40">{text}</span>
      <span className="ml-2 text-[10px] text-muted-foreground/25 select-none">
        {candidates.length > 1 && `${candidateIndex + 1}/${candidates.length} · `}
        Tab 적용 · Alt+→ 단어 · Alt+↑↓ 후보 · Alt+R 새 후보 · Esc 숨김
      </span>
    </span>
  );
}
