import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { writingExamples, writingScenes } from '@/lib/db/schema';
import { getProject } from '@/lib/db/queries/projects';
import { assertWorkbenchChapter, getScene, listScenes, listWritingExamples, saveScene } from '@/lib/db/queries/writing-workbench';
import { editGoalSchema, exampleSchema, scenePlanSchema } from '@/lib/writing-workbench';
import { draftScene, diagnoseEdits, rewriteGoals, manuscriptSnapshot } from '@/lib/ai/editorial-workflow';
import { longTaskResponse } from '@/lib/ai/long-task-stream';
import { extractBoundedPlateText } from '@/lib/editor/bounded-plate-content';

type Context = { params: Promise<{ id: string }> };
const aiFields = { chapterId: z.string().uuid(), sceneId: z.string().uuid().nullable().optional(), currentContentJson: z.string().max(300000) };
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save-scene'), chapterId: z.string().uuid(), id: z.string().uuid().optional(), revision: z.number().int().positive().optional(), title: z.string().trim().min(1).max(160), status: z.enum(['draft', 'confirmed']), plan: scenePlanSchema }),
  z.object({ action: z.literal('delete-scene'), chapterId: z.string().uuid(), id: z.string().uuid(), revision: z.number().int().positive() }),
  z.object({ action: z.literal('save-example'), example: exampleSchema }),
  z.object({ action: z.literal('delete-example'), id: z.string().uuid() }),
  z.object({ action: z.literal('draft-scene'), ...aiFields }),
  z.object({ action: z.literal('diagnose'), ...aiFields }),
  z.object({ action: z.literal('rewrite'), ...aiFields, snapshot: z.string().length(64), goals: z.array(editGoalSchema).min(1).max(4), supplement: z.string().max(3000).default('') }),
]);
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!await getProject(db, id)) return Response.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
  const url = new URL(request.url);
  const examples = listWritingExamples(db, id);
  if (url.searchParams.get('format') === 'jsonl') {
    const lines = examples.map(example => JSON.stringify({ kind: example.kind, verdict: example.verdict,
      instruction: example.reason, input: example.original, output: example.replacement, title: example.title }));
    return new Response(lines.join('\n'), { headers: { 'Content-Type': 'application/x-ndjson', 'Content-Disposition': 'attachment; filename="writing-examples.jsonl"', 'Cache-Control': 'no-store' } });
  }
  try {
    const chapterId = url.searchParams.get('chapterId');
    return Response.json({ scenes: chapterId ? listScenes(db, id, chapterId) : [], examples });
  } catch { return Response.json({ error: '회차를 찾을 수 없습니다.' }, { status: 404 }); }
}
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!await getProject(db, id)) return Response.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
  try {
    const body = actions.parse(await request.json());
    if (body.action === 'save-scene') return Response.json(saveScene(db, id, body.chapterId, body));
    if (body.action === 'delete-scene') {
      const scene = getScene(db, id, body.chapterId, body.id);
      if (scene.revision !== body.revision) throw new Error('SCENE_CONFLICT');
      db.delete(writingScenes).where(and(eq(writingScenes.id, scene.id), eq(writingScenes.revision, scene.revision))).run();
      return Response.json({ success: true });
    }
    if (body.action === 'save-example') {
      if (listWritingExamples(db, id).length >= 200) return Response.json({ error: '사례는 작품당 200개까지 저장할 수 있습니다.' }, { status: 400 });
      return Response.json(db.insert(writingExamples).values({ ...body.example, projectId: id }).returning().get());
    }
    if (body.action === 'delete-example') {
      db.delete(writingExamples).where(and(eq(writingExamples.id, body.id), eq(writingExamples.projectId, id))).run();
      return Response.json({ success: true });
    }
    assertWorkbenchChapter(db, id, body.chapterId);
    if (body.sceneId) getScene(db, id, body.chapterId, body.sceneId);
    const prose = extractBoundedPlateText(body.currentContentJson);
    if (body.action === 'rewrite' && manuscriptSnapshot(prose) !== body.snapshot) {
      return Response.json({ error: '진단 후 원고가 바뀌었습니다. 편집 목표를 다시 검토해주세요.' }, { status: 409 });
    }
    if (body.action === 'rewrite' && body.goals.some(goal => goal.action === 'supplement') && !body.supplement.trim()) {
      return Response.json({ error: '보충할 사실이나 연결 내용을 먼저 입력해주세요.' }, { status: 400 });
    }
    return longTaskResponse(request, (signal, progress) => {
      const options = { db, projectId: id, chapterId: body.chapterId, sceneId: body.sceneId, prose, signal, progress };
      if (body.action === 'draft-scene') return draftScene(options);
      if (body.action === 'diagnose') return diagnoseEdits(options);
      return rewriteGoals({ ...options, goals: body.goals, snapshot: body.snapshot, supplement: body.supplement });
    });
  } catch (error) {
    const conflict = error instanceof Error && error.message === 'SCENE_CONFLICT';
    return Response.json({ error: conflict ? '다른 화면에서 장면이 수정되었습니다. 새로 불러온 뒤 다시 저장해주세요.' : '입력 내용과 작품·회차·장면을 확인해주세요.' }, { status: conflict ? 409 : 400 });
  }
}
