import { streamText } from 'ai';
import type { DB } from '@/lib/db';
import { listChapters } from '@/lib/db/queries/chapters';
import { textNoteContentSchema } from '@/lib/author-notebook';
import type { StorylineMessage } from '@/lib/storyline-chat';
import { extractBoundedPlateText } from '@/lib/editor/bounded-plate-content';
import { runWritingKnowledgeAgent } from '@/lib/knowledge/writing-knowledge';
import { buildStoryContext } from './build-story-context';
import { buildStorylineSystemPrompt, selectStorylineHistory, selectStorylineManuscript } from './storyline-context';
import { createProvider } from './provider-factory';
import { getProviderOptions } from './provider-options';
import { runAIRequest } from './request-scheduler';
import type { ProviderConfig } from './types';

export async function replyToStoryline(options: {
  db: DB; projectId: string; noteContentJson: string; message: string;
  history: StorylineMessage[]; chapterId: string | null; config: ProviderConfig;
  signal: AbortSignal; progress: (message: string) => void; delta: (text: string) => void;
}) {
  const { db, projectId, signal, config, message, progress } = options;
  progress('저장된 원고와 스토리라인에서 질문에 관련된 문맥을 찾고 있습니다.');
  const contextSize = config.contextSize ?? 32768;
  const maxOutputTokens = Math.min(4096, Math.floor(contextSize / 4));
  const budget = Math.max(600, Math.min(20000, Math.floor((contextSize - maxOutputTokens - 2200) / 2) - message.length));
  const allChapters = await listChapters(db, projectId);
  if (options.chapterId && !allChapters.some(chapter => chapter.id === options.chapterId)) throw new Error('회차를 찾을 수 없습니다.');
  const chapters = allChapters.map(chapter => ({ ...chapter, text: extractBoundedPlateText(chapter.contentJson ?? undefined) }));
  const manuscript = selectStorylineManuscript(chapters, `${message}\n${options.history.filter(m => m.role === 'user').at(-1)?.text ?? ''}`, Math.floor(budget * .4), options.chapterId);
  const canon = await buildStoryContext(db, projectId, options.chapterId ?? undefined, { focusText: message, maxChars: Math.floor(budget * .17) });
  const note = textNoteContentSchema.parse(JSON.parse(options.noteContentJson)).text;
  const noteBudget = Math.floor(budget * .2);
  const noteContext = note.length <= noteBudget ? note : `${note.slice(0, Math.floor(noteBudget / 2))}\n[중간 구상 생략]\n${note.slice(-Math.floor(noteBudget / 2))}`;
  const outlines = chapters.map(chapter => `[${chapter.title}] ${chapter.outline ?? ''} ${chapter.summary ?? ''}`).join('\n').slice(0, Math.floor(budget * .06));
  const knowledge = runWritingKnowledgeAgent({ instruction: message, storyContext: canon, maxChars: Math.floor(budget * .07) }).context;
  const history = selectStorylineHistory(options.history, Math.floor(budget * .1));
  const coverage = `전체 ${chapters.length}회차 중 ${manuscript.references.length}회차 본문 발췌 ${manuscript.readChars}/${manuscript.totalChars}자. ${manuscript.partial ? '전체 원고를 읽은 것이 아님.' : '현재 저장된 원고 본문 전체 포함.'} 노트 ${note.length > noteBudget ? '일부 발췌' : '전체 포함'}. 대화는 최근 문맥 일부만 전달됨.`;
  progress(`원고 ${manuscript.references.length}개 회차를 참고합니다. AI 응답 순서를 기다리고 있습니다.`);
  return runAIRequest(config, { projectId, priority: 'standard', signal }, async abortSignal => {
    progress('원고와 구상을 비교하며 전개를 검토하고 있습니다.');
    const result = streamText({
      model: createProvider({ ...config, ...(config.provider === 'ollama' ? { mode: 'chat' as const } : {}) }),
      providerOptions: getProviderOptions(config), abortSignal, maxRetries: 0,
      temperature: .65, maxOutputTokens,
      system: buildStorylineSystemPrompt({ canon, note: noteContext, outlines, knowledge, manuscript: manuscript.text, coverage }),
      messages: [...history, { role: 'user', content: message }],
    });
    let text = '';
    for await (const part of result.fullStream) {
      abortSignal.throwIfAborted();
      if (part.type === 'error') throw part.error;
      if (part.type === 'text-delta') {
        text += part.text;
        if (text.length > 20000) throw new Error('응답이 너무 깁니다.');
        options.delta(part.text);
      }
    }
    abortSignal.throwIfAborted();
    if (!text.trim()) throw new Error('AI가 답변을 생성하지 못했습니다.');
    return { text: text.trim(), incomplete: await result.finishReason === 'length', references: [coverage, ...manuscript.references.slice(0, 29)] };
  });
}
