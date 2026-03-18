'use client';

import { serializeMd, stripMarkdown } from '@platejs/markdown';
import { bindFirst, type PluginConfig } from 'platejs';
import {
  createTPlatePlugin,
  getEditorPlugin,
  type OverrideEditor,
  type PlateEditor,
  type RenderNodeWrapperProps,
  useElement,
  useFocused,
  usePluginOption,
} from 'platejs/react';
import type React from 'react';

import { MarkdownKit } from './markdown-kit';

export type InlineSuggestionConfig = PluginConfig<
  'inlineSuggestion',
  {
    suggestionText: string | null;
    suggestionNodeId: string | null;
    renderGhostText: (() => React.ReactNode) | null;
    abortController: AbortController | null;
    isAccepting: boolean;
    isLoading: boolean;
    chapterId: string | null;
    acceptedWordCount: number;
    candidateList: string[];
    candidateIndex: number;
  },
  {
    inlineSuggestion: {
      setSuggestion: (text: string, nodeId?: string) => void;
      clearSuggestion: () => void;
    };
  },
  {
    inlineSuggestion: {
      accept: () => false | undefined;
    };
  },
  {
    isSuggested: (id: string) => boolean;
  }
>;

const NON_SPACE_REGEX = /^\s*(\S)/;
const TOKEN_MATCH_REGEX = /^(\s*\S+[\u3000-\u303F\uFF00-\uFFEF.,!?…]*)/;
const PROJECT_PATH_REGEX = /\/projects\/([^/]+)/;
const COPILOT_LOCAL_CONTEXT_CHAR_LIMIT = 2400;
const COPILOT_GLOBAL_CONTEXT_CHAR_LIMIT = 4000;
const COPILOT_DEBOUNCE_MS = 150;
const COPILOT_TIMEOUT_MS = 10000;
const COPILOT_SENTENCE_CHAR_LIMIT = 120;

function extractInlineSuggestionContext(fullContent: string): {
  globalContext: string;
  localContext: string;
} {
  const normalized = stripMarkdown(fullContent)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (normalized.length === 0) {
    return { globalContext: '', localContext: '' };
  }

  const selected: string[] = [];

  for (let index = normalized.length - 1; index >= 0; index--) {
    const candidate = normalized[index];
    const next = selected.length > 0
      ? [candidate, ...selected].join(' / ')
      : candidate;

    if (next.length > COPILOT_LOCAL_CONTEXT_CHAR_LIMIT) {
      break;
    }

    selected.unshift(candidate);
  }

  const localContext = selected.length > 0
    ? selected.join('\n\n')
    : normalized.at(-1)?.slice(-COPILOT_LOCAL_CONTEXT_CHAR_LIMIT) ?? '';

  const globalContext = normalized.join('\n\n').slice(-COPILOT_GLOBAL_CONTEXT_CHAR_LIMIT);

  return { globalContext, localContext };
}

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
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const NGRAM_SIZE = 3;
  if (normalizedSuggestion.length >= NGRAM_SIZE && normalizedContext.length >= NGRAM_SIZE) {
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
    if (total > 0 && shared / total > 0.5) {
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
  const { suggestionText, acceptedWordCount } = getOptions();
  const normalizedSuggestion = suggestionText
    ? sanitizeSuggestionText(suggestionText)
    : null;

  if (!normalizedSuggestion?.length) return false;

  // Shift+Tab: accept one word at a time
  if (wordOnly) {
    const nextCount = acceptedWordCount + 1;
    const { accepted } = splitSuggestionByWordCount(normalizedSuggestion, nextCount);
    if (!accepted) return false;

    setOptions({ isAccepting: true });
    editor.tf.insertText(accepted);
    setOptions({ isAccepting: false });

    const { pending } = splitSuggestionByWordCount(normalizedSuggestion, nextCount);
    if (pending?.trim()) {
      api.inlineSuggestion.setSuggestion(pending.trimStart());
    } else {
      api.inlineSuggestion.clearSuggestion();
      triggerCompletion(editor);
    }
    return;
  }

  // If no words were previewed via ArrowRight, accept all
  if (acceptedWordCount <= 0) {
    setOptions({ isAccepting: true });
    editor.tf.insertText(normalizedSuggestion);
    setOptions({ isAccepting: false });
    api.inlineSuggestion.clearSuggestion();
    triggerCompletion(editor);
    return;
  }

  // Accept only the previewed (accepted) portion
  const { accepted } = splitSuggestionByWordCount(normalizedSuggestion, acceptedWordCount);

  if (!accepted) return false;

  setOptions({ isAccepting: true });
  editor.tf.insertText(accepted);
  setOptions({ isAccepting: false });
  api.inlineSuggestion.clearSuggestion();
  triggerCompletion(editor);
}

/**
 * Move the preview cursor by one word unit without inserting text.
 */
function movePreviewWord(editor: PlateEditor, direction: 'forward' | 'backward') {
  const { getOptions, setOptions } = getEditorPlugin<InlineSuggestionConfig>(editor, {
    key: 'inlineSuggestion',
  });
  const { suggestionText, acceptedWordCount } = getOptions();

  if (!suggestionText?.length) return false;

  if (direction === 'backward') {
    if (acceptedWordCount <= 0) return false;

    setOptions({ acceptedWordCount: acceptedWordCount - 1 });
    return true;
  }

  const { pending } = splitSuggestionByWordCount(suggestionText, acceptedWordCount);
  const { chunk } = getNextSuggestionChunk(pending);

  if (!chunk) return false;

  setOptions({ acceptedWordCount: acceptedWordCount + 1 });
  return true;
}

const renderBelowNodes = ({
  editor,
}: RenderNodeWrapperProps<InlineSuggestionConfig>) => {
  const { getOptions } = getEditorPlugin<InlineSuggestionConfig>(editor, {
    key: 'inlineSuggestion',
  });
  const { renderGhostText: GhostText } = getOptions();

  if (!GhostText) {
    return;
  }

  return ({ children }: { children: React.ReactNode }) => (
    <>
      {children}
      <GhostText />
    </>
  );
};

const withInlineSuggestion: OverrideEditor<InlineSuggestionConfig> = ({
  api,
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
        setOptions({ isAccepting: true, suggestionText: remaining || null });
        insertText(text, options);
        setOptions({ isAccepting: false });
        return;
      }

      insertText(text, options);
    },
  },
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeRequestId = 0;

/**
 * Run a single completion request and show the result as ghost text.
 * Used by both the debounced onChange trigger and the ArrowUp regenerate key.
 */
const runCompletion = async (editor: PlateEditor, temperature = 0.4) => {
  if (!editor.api.isCollapsed()) return;

  const t0 = performance.now();

  const { getOptions, api } = getEditorPlugin<InlineSuggestionConfig>(editor, {
    key: 'inlineSuggestion',
  });

  const { chapterId } = getOptions();
  const currentBlockId = getCurrentBlockId(editor);
  if (!currentBlockId) return;

  const fullContent = serializeMd(editor);
  const { globalContext, localContext } = extractInlineSuggestionContext(fullContent);
  if (!localContext) return;

  getOptions().abortController?.abort();

  const abortController = new AbortController();
  const requestId = ++activeRequestId;
  const timeoutId = setTimeout(() => abortController.abort(), COPILOT_TIMEOUT_MS);
  editor.setOption(InlineSuggestionPlugin, 'abortController', abortController);
  editor.setOption(InlineSuggestionPlugin, 'isLoading', true);

  try {
    const projectIdMatch =
      typeof window !== 'undefined'
        ? window.location.pathname.match(PROJECT_PATH_REGEX)
        : null;
    const projectId = projectIdMatch?.[1];

    const needGlobal =
      globalContext &&
      globalContext !== localContext &&
      !globalContext.endsWith(localContext);

    // Strip HTML entities produced by serializeMd (e.g. &#x20; &nbsp;)
    const cleanPrompt = (needGlobal
      ? `${globalContext}\n\n${localContext}`
      : localContext
    ).replace(/&#x[0-9a-f]+;/gi, (m) => String.fromCodePoint(parseInt(m.slice(3, -1), 16)))
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

    if (cleanPrompt.trim().length < 15) {
      console.log('[ghost] prompt too short, skipping');
      return;
    }

    console.log('[ghost] sending prompt:', JSON.stringify(cleanPrompt.slice(0, 120)), 'len:', cleanPrompt.length);

    const tFetch = performance.now();
    console.log(`[ghost] ⏱ prep: ${(tFetch - t0).toFixed(0)}ms`);

    const res = await fetch('/api/ai/copilot', {
      body: JSON.stringify({
        mode: 'inline-suggestion',
        maxOutputTokens: 32,
        projectId,
        chapterId,
        prompt: cleanPrompt,
        temperature,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: abortController.signal,
    });

    if (requestId !== activeRequestId) return;
    if (!res.ok) {
      console.warn('[ghost] response not ok:', res.status);
      return;
    }

    const data = (await res.json()) as { text?: string };
    const tLlm = performance.now();
    console.log(`[ghost] ⏱ LLM: ${(tLlm - tFetch).toFixed(0)}ms`);
    const completion = data.text;
    console.log('[ghost] raw completion:', JSON.stringify(completion?.slice(0, 80)));

    if (!completion || completion === '0') return;

    // Take the full completion text, clean it up to a single line
    const extracted = completion
      .replace(/^\s+/, '')             // strip leading whitespace/newlines
      .split(/\n\n+|\n(?=#)/)[0]  // first paragraph only
      ?.replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!extracted || extracted.length < 2) {
      console.log('[ghost] empty extraction');
      return;
    }

    const candidates = extractSentenceCandidates(extracted);
    for (const sentenceCandidate of candidates) {
      const suggestion = trimContextEcho(localContext, sentenceCandidate);
      const normalizedSuggestion = sanitizeSuggestionText(suggestion);
      if (!normalizedSuggestion.trim()) continue;
      if (!hasMeaningfulSuggestionText(normalizedSuggestion)) continue;
      if (isTooSimilarToContext(localContext, normalizedSuggestion)) continue;

      clearTimeout(timeoutId);
      api.inlineSuggestion.setSuggestion(normalizedSuggestion, currentBlockId);
      const tShow = performance.now();
      console.log(`[ghost] ⏱ post: ${(tShow - tLlm).toFixed(0)}ms | total: ${(tShow - t0).toFixed(0)}ms`);
      return;
    }
    console.log('[ghost] all candidates too similar to context');
  } catch {
    // timeout or abort
  } finally {
    clearTimeout(timeoutId);
    if (requestId === activeRequestId) {
      editor.setOption(InlineSuggestionPlugin, 'abortController', null);
      editor.setOption(InlineSuggestionPlugin, 'isLoading', false);
    }
  }
};

const triggerCompletion = (editor: PlateEditor) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runCompletion(editor, 0.4), COPILOT_DEBOUNCE_MS);
};

export const InlineSuggestionPlugin =
  createTPlatePlugin<InlineSuggestionConfig>({
    key: 'inlineSuggestion',
    options: {
      abortController: null,
      acceptedWordCount: 0,
      candidateIndex: 0,
      candidateList: [] as string[],
      chapterId: null,
      isAccepting: false,
      isLoading: false,
      renderGhostText: null,
      suggestionNodeId: null,
      suggestionText: null,
    },
    handlers: {
      onBlur: ({ api }) => {
        api.inlineSuggestion.clearSuggestion();
      },
      onChange: ({ editor, getOptions }) => {
        const { suggestionText, isLoading } = getOptions();
        // Don't trigger while a suggestion is visible or a request is in flight
        if (suggestionText || isLoading) return;
        triggerCompletion(editor);
      },
      onKeyDown: ({ editor, event, getOptions }) => {
        const { suggestionText } = getOptions();

        if (!suggestionText?.length) return;

        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation?.();
          acceptSuggestion(editor);
          return true;
        }

        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation?.();
          acceptSuggestion(editor, true);
          return true;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation?.();
          acceptSuggestion(editor);
          return true;
        }

        if (event.key === 'ArrowDown') {
          return;
        }

        if (event.key === 'ArrowUp') {
          // Discard current ghost text and regenerate a new one
          const { api: _api } = getEditorPlugin<InlineSuggestionConfig>(editor, { key: 'inlineSuggestion' });
          _api.inlineSuggestion.clearSuggestion();
          // Slightly higher temperature for variety on each regenerate
          const nextTemp = Math.min(0.4 + Math.random() * 0.4, 0.85);
          void runCompletion(editor, nextTemp);
          event.preventDefault();
          event.stopPropagation();
          return true;
        }

        if (event.key === 'ArrowRight') {
          const handled = movePreviewWord(editor, 'forward');

          if (!handled) return;

          event.preventDefault();
          event.stopPropagation();
          return true;
        }

        if (event.key === 'ArrowLeft') {
          const handled = movePreviewWord(editor, 'backward');

          if (!handled) return;

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
    .extendApi(({ setOptions }) => ({
      clearSuggestion: () =>
        setOptions({
          abortController: null,
          acceptedWordCount: 0,
          candidateIndex: 0,
          candidateList: [],
          isLoading: false,
          suggestionNodeId: null,
          suggestionText: null,
        }),
      setSuggestion: (text: string, nodeId?: string) =>
        setOptions({
          acceptedWordCount: 0,
          isLoading: false,
          suggestionNodeId: nodeId ?? null,
          suggestionText: text,
        }),
    }))
    .extendTransforms(({ editor }) => ({
      accept: bindFirst(acceptSuggestion, editor),
    }))
    .overrideEditor(withInlineSuggestion)
    .extend({
      render: { belowNodes: renderBelowNodes },
      shortcuts: {
        clearSuggestion: { keys: 'escape' },
      },
    });

export const InlineSuggestionKit = [
  ...MarkdownKit,
  InlineSuggestionPlugin.configure({
    options: {
      renderGhostText: InlineGhostText,
    },
  }),
];

export function InlineGhostText() {
  const element = useElement();
  const focused = useFocused();
  const isSuggested = usePluginOption(InlineSuggestionPlugin, 'isSuggested', element.id as string);
  const isLoading = usePluginOption(InlineSuggestionPlugin, 'isLoading');
  const text = usePluginOption(InlineSuggestionPlugin, 'suggestionText');

  if (!isSuggested || !focused || (!text && !isLoading)) return null;

  return <InlineGhostTextContent />;
}

function InlineGhostTextContent() {
  const isLoading = usePluginOption(InlineSuggestionPlugin, 'isLoading');
  const text = usePluginOption(InlineSuggestionPlugin, 'suggestionText');
  const acceptedWordCount = usePluginOption(InlineSuggestionPlugin, 'acceptedWordCount');
  const candidateList = usePluginOption(InlineSuggestionPlugin, 'candidateList');
  const candidateIndex = usePluginOption(InlineSuggestionPlugin, 'candidateIndex');

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

  const { accepted, pending } = splitSuggestionByWordCount(text, acceptedWordCount);
  const totalCandidates = candidateList.length;

  return (
    <span
      className="pointer-events-none max-sm:hidden"
      contentEditable={false}
    >
      {accepted && (
        <span className="text-muted-foreground/80">{accepted}</span>
      )}
      {pending && (
        <span className="text-muted-foreground/40">{pending}</span>
      )}
      <span className="ml-2 text-[10px] text-muted-foreground/25 select-none">
        Tab ⏎
      </span>
      {totalCandidates > 1 && (
        <span className="ml-1 text-xs text-muted-foreground/30">
          [{candidateIndex + 1}/{totalCandidates} ↑↓]
        </span>
      )}
    </span>
  );
}
