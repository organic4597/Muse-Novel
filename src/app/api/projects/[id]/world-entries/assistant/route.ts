import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  generateWorldEntryBatch,
  resolveWorldEntryRequestCount,
} from '@/lib/ai/entity-suggestions';
import { isAIRequestQueueFullError } from '@/lib/ai/request-scheduler';
import { worldTitleKey } from '@/lib/ai/world-request';
import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { listWorldEntries } from '@/lib/db/queries/world-entries';
import { listPendingWorldSuggestions, saveWorldSuggestions } from '@/lib/db/queries/world-suggestions';
import { WEB_SEARCH_MODES, type WebResearch } from '@/lib/web-research/types';

const requestSchema = z.object({
  webSearchMode: z.enum(WEB_SEARCH_MODES).default('auto'),
  instruction: z.string().trim().min(3).max(5000),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getProject(db, id))) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json({ suggestions: await listPendingWorldSuggestions(db, id) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: '추가할 세계관 항목을 3자 이상 입력해주세요.' },
      { status: 400 }
    );
  }

  try {
    if (!(await getProject(db, id))) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    let research: WebResearch | undefined;
    const requestedCount = resolveWorldEntryRequestCount(parsed.data.instruction);
    if (requestedCount !== undefined && (requestedCount < 1 || requestedCount > 20)) return NextResponse.json({ error: '한 번에 1~20개의 항목을 요청해주세요.' }, { status: 400 });
    const generation = await generateWorldEntryBatch({
      abortSignal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(600_000),
      ]),
      count: requestedCount,
      instruction: parsed.data.instruction,
      webSearchMode: parsed.data.webSearchMode,
      onResearch: (result) => { research = result; },
      projectId: id,
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    research = generation.research ?? research;
    const suggestions = generation.entries;
    const existingEntries = await listWorldEntries(db, id);
    const existingPending = await listPendingWorldSuggestions(db, id);
    const existingKeys = new Set(existingEntries.map((entry) => worldTitleKey(entry.title)));
    const knownTitles = new Set([...existingEntries, ...existingPending].map((entry) => worldTitleKey(entry.title)));
    const candidates: typeof suggestions = [];
    const skippedTitles: string[] = [];

    for (const suggestion of suggestions) {
      const normalizedTitle = worldTitleKey(suggestion.title);
      if (knownTitles.has(normalizedTitle)) {
        skippedTitles.push(suggestion.title);
        continue;
      }

      knownTitles.add(normalizedTitle);
      candidates.push(suggestion);
    }

    request.signal.throwIfAborted();
    const report = { ...generation.report, generatedCount: candidates.length,
      existingTitles: [...new Set([...generation.report.existingTitles, ...skippedTitles.filter((title) => existingKeys.has(worldTitleKey(title)))])],
      pendingTitles: [...new Set([...generation.report.pendingTitles, ...skippedTitles.filter((title) => !existingKeys.has(worldTitleKey(title)))])],
    };
    const pending = await saveWorldSuggestions(db, id, candidates, { research, report });
    return NextResponse.json({
      research,
      suggestions: pending,
      editSuggestions: generation.editSuggestions,
      operation: generation.operation,
      pendingCount: pending.length,
      requestedCount: report.requestedCount,
      report,
      skippedTitles,
    });
  } catch (error) {
    if (isAIRequestQueueFullError(error)) {
      return NextResponse.json(
        {
          code: 'ai_queue_full',
          error: error.message,
        },
        {
          headers: { 'Retry-After': String(error.retryAfterSeconds) },
          status: 429,
        }
      );
    }

    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError');

    return NextResponse.json(
      {
        error: isTimeout
          ? '세계관 생성 시간이 초과되었습니다. 요청 개수를 줄여 다시 시도해주세요.'
          : error instanceof Error
            ? error.message
            : '세계관 항목을 생성하지 못했습니다.',
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
