import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getChapter } from '@/lib/db/queries/chapters';
import { getProject } from '@/lib/db/queries/projects';
import { createPlotEdge, createPlotNode, deletePlotEdge, deletePlotNode, getPlotEdge, getPlotNode, listPlotBoard, updatePlotNode } from '@/lib/db/queries/plot-board';
import { plotEdgeInputSchema, plotNodeInputSchema } from '@/lib/plot-board';
import { getStoryCalendar } from '@/lib/story-timeline';

type Context = { params: Promise<{ id: string }> };
const nodeBodySchema = z.object({ resource: z.literal('node'), data: plotNodeInputSchema });
const edgeBodySchema = z.object({ resource: z.literal('edge'), data: plotEdgeInputSchema });
const updateBodySchema = z.object({ resource: z.literal('node'), id: z.string().uuid(), data: plotNodeInputSchema.partial() });
const deleteSchema = z.object({ resource: z.enum(['node', 'edge']), id: z.string().uuid() });

async function ownedProject(context: Context) {
  const { id } = await context.params;
  return { id, project: await getProject(db, id) };
}

async function validateNodeChapter(projectId: string, chapterId?: string | null) {
  if (!chapterId) return null;
  const chapter = await getChapter(db, chapterId);
  return chapter?.projectId === projectId ? chapter : undefined;
}

export async function GET(_request: Request, context: Context) {
  const { id, project } = await ownedProject(context);
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json({ ...await listPlotBoard(db, id), calendar: getStoryCalendar(project.settingsJson) });
}

export async function POST(request: Request, context: Context) {
  const { id, project } = await ownedProject(context);
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  const node = nodeBodySchema.safeParse(body);
  if (node.success) {
    const chapter = await validateNodeChapter(id, node.data.data.chapterId);
    if (chapter === undefined) return NextResponse.json({ error: '다른 프로젝트의 회차를 연결할 수 없습니다.' }, { status: 400 });
    const data = chapter && node.data.data.storyDatePrecision === 'none' ? { ...node.data.data,
      storyYear: chapter.storyYear, storyMonth: chapter.storyMonth, storyDay: chapter.storyDay,
      storyTimeLabel: chapter.storyTimeLabel, storyDatePrecision: chapter.storyDatePrecision, storyDateLabel: chapter.storyDateLabel,
    } : node.data.data;
    return NextResponse.json(createPlotNode(db, id, data), { status: 201 });
  }
  const edge = edgeBodySchema.safeParse(body);
  if (edge.success) {
    const [from, to] = [getPlotNode(db, edge.data.data.fromNodeId), getPlotNode(db, edge.data.data.toNodeId)];
    if (from?.projectId !== id || to?.projectId !== id) return NextResponse.json({ error: '연결할 노드를 확인해주세요.' }, { status: 400 });
    try { return NextResponse.json(createPlotEdge(db, id, edge.data.data), { status: 201 }); }
    catch { return NextResponse.json({ error: '이미 같은 연결이 있습니다.' }, { status: 409 }); }
  }
  return NextResponse.json({ error: '보드 항목 형식을 확인해주세요.' }, { status: 400 });
}

export async function PUT(request: Request, context: Context) {
  const { id, project } = await ownedProject(context);
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  const parsed = updateBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || getPlotNode(db, parsed.data.id)?.projectId !== id) return NextResponse.json({ error: '수정할 노드를 찾을 수 없습니다.' }, { status: 404 });
  const chapter = parsed.data.data.chapterId ? await validateNodeChapter(id, parsed.data.data.chapterId) : null;
  if (chapter === undefined) return NextResponse.json({ error: '다른 프로젝트의 회차를 연결할 수 없습니다.' }, { status: 400 });
  const data = chapter && parsed.data.data.storyDatePrecision === 'none' ? { ...parsed.data.data,
    storyYear: chapter.storyYear, storyMonth: chapter.storyMonth, storyDay: chapter.storyDay,
    storyTimeLabel: chapter.storyTimeLabel, storyDatePrecision: chapter.storyDatePrecision, storyDateLabel: chapter.storyDateLabel,
  } : parsed.data.data;
  return NextResponse.json(updatePlotNode(db, parsed.data.id, data));
}

export async function DELETE(request: Request, context: Context) {
  const { id, project } = await ownedProject(context);
  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  const parsed = deleteSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: '삭제 대상을 확인해주세요.' }, { status: 400 });
  const target = parsed.data.resource === 'node' ? getPlotNode(db, parsed.data.id) : getPlotEdge(db, parsed.data.id);
  if (target?.projectId !== id) return NextResponse.json({ error: '삭제 대상을 찾을 수 없습니다.' }, { status: 404 });
  if (parsed.data.resource === 'node') deletePlotNode(db, parsed.data.id); else deletePlotEdge(db, parsed.data.id);
  return new NextResponse(null, { status: 204 });
}
