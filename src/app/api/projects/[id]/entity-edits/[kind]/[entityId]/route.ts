import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateExistingEntityEdit } from '@/lib/ai/entity-suggestions';
import { isAIRequestQueueFullError } from '@/lib/ai/request-scheduler';
import { db } from '@/lib/db';
import { applyEntityRevision, EntityRevisionError, getEntityRestorePreview, getEntityRevisionState, listEntityRevisions } from '@/lib/db/queries/entity-revisions';
import { ENTITY_KINDS, type EntityKind } from '@/lib/entity-revisions';
import { WEB_SEARCH_MODES } from '@/lib/web-research/types';

type Context = { params: Promise<{ id: string; kind: string; entityId: string }> };
const version = z.string().regex(/^[a-f0-9]{64}$/);
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), instruction: z.string().trim().min(3).max(5000), webSearchMode: z.enum(WEB_SEARCH_MODES).default('off') }),
  z.object({ action: z.literal('apply'), baseVersion: version, changes: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal('restore'), baseVersion: version, revisionId: z.number().int().positive() }),
]);
async function target(context: Context) {
  const { id, kind, entityId } = await context.params;
  if (!(ENTITY_KINDS as readonly string[]).includes(kind)) throw new EntityRevisionError('지원하지 않는 항목 종류입니다.', 400);
  return { projectId: id, kind: kind as EntityKind, entityId };
}
function failure(error: unknown) {
  if (isAIRequestQueueFullError(error)) return NextResponse.json({ error: error.message }, { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } });
  if (error instanceof EntityRevisionError) return NextResponse.json({ error: error.message }, { status: error.status });
  const timeout = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name);
  return NextResponse.json({ error: timeout ? '수정안 생성이 취소되거나 10분 제한을 넘었습니다. 저장된 내용은 변경되지 않았습니다.' : error instanceof z.ZodError ? '요청 형식을 확인해주세요.' : error instanceof Error ? error.message : '설정 수정 작업을 완료하지 못했습니다.' }, { status: timeout ? 504 : 400 });
}
export async function GET(request: Request, context: Context) {
  try {
    const selected = await target(context);
    const params = new URL(request.url).searchParams;
    const revisionId = params.get('revisionId');
    if (revisionId) return NextResponse.json(getEntityRestorePreview(db, selected, z.coerce.number().int().positive().parse(revisionId)));
    const state = getEntityRevisionState(db, selected);
    const beforeId = params.get('beforeId');
    return NextResponse.json({ ...state, ...listEntityRevisions(db, selected, beforeId ? z.coerce.number().int().positive().parse(beforeId) : undefined) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const selected = await target(context);
    const input = actionSchema.parse(await request.json());
    const state = getEntityRevisionState(db, selected);
    if (input.action === 'propose') {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(600_000)]);
      const proposal = await generateExistingEntityEdit({ ...selected, snapshot: state.snapshot, instruction: input.instruction, webSearchMode: input.webSearchMode, abortSignal: signal });
      signal.throwIfAborted();
      return NextResponse.json({ ...proposal, before: state.snapshot, baseVersion: state.version });
    }
    request.signal.throwIfAborted();
    return NextResponse.json(applyEntityRevision(db, selected, input.baseVersion, input.action === 'restore' ? { revisionId: input.revisionId } : { changes: input.changes }));
  } catch (error) { return failure(error); }
}
