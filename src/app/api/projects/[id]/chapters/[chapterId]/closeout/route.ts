import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getChapter } from '@/lib/db/queries/chapters';
import { listCharacters } from '@/lib/db/queries/characters';
import { getProject } from '@/lib/db/queries/projects';
import { listWorldEntries } from '@/lib/db/queries/world-entries';
import { applyChapterCloseout } from '@/lib/db/queries/chapter-closeout';
import { applyChapterCloseoutSchema } from '@/lib/chapter-closeout';
import { extractBoundedPlateText } from '@/lib/editor/bounded-plate-content';
import { chapterSnapshotHash, generateChapterCloseout } from '@/lib/ai/chapter-closeout';
import { resolveProjectProvider } from '@/lib/ai/resolve-project-provider';
import { longTaskResponse } from '@/lib/ai/long-task-stream';
import { getStoryCalendar } from '@/lib/story-timeline';

export const maxDuration = 600;
type Context = { params: Promise<{ id: string; chapterId: string }> };

async function owned(context: Context) {
  const { id, chapterId } = await context.params;
  const [project, chapter] = await Promise.all([getProject(db, id), getChapter(db, chapterId)]);
  return { id, chapterId, project, chapter: chapter?.projectId === id ? chapter : null };
}

export async function POST(request: Request, context: Context) {
  const { id, chapterId, project, chapter } = await owned(context);
  if (!project || !chapter) return NextResponse.json({ error: '회차를 찾을 수 없습니다.' }, { status: 404 });
  const contentJson = chapter.contentJson ?? '';
  const prose = extractBoundedPlateText(contentJson);
  if (!prose.trim()) return NextResponse.json({ error: '마감할 원고가 없습니다.' }, { status: 400 });
  const config = await resolveProjectProvider(db, id);
  if (!config) return NextResponse.json({ error: '일반 AI 제공자를 먼저 설정해주세요.' }, { status: 503 });
  return longTaskResponse(request, (signal, progress) => generateChapterCloseout({
    db, projectId: id, chapterId, contentJson, prose, config, signal, progress,
  }));
}

export async function PUT(request: Request, context: Context) {
  const { id, chapterId, project, chapter } = await owned(context);
  if (!project || !chapter) return NextResponse.json({ error: '회차를 찾을 수 없습니다.' }, { status: 404 });
  const parsed = applyChapterCloseoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '마감 후보 형식을 확인해주세요.' }, { status: 400 });
  const contentJson = chapter.contentJson ?? '';
  if (chapterSnapshotHash(contentJson) !== parsed.data.snapshotHash) return NextResponse.json({ error: '원고가 변경되었습니다. 다시 분석해주세요.' }, { status: 409 });
  const prose = extractBoundedPlateText(contentJson);
  const allEvidence = [parsed.data.storyDate?.evidence, ...parsed.data.states.map(value => value.evidence), ...parsed.data.plotNodes.map(value => value.evidence)].filter(Boolean) as string[];
  if (allEvidence.some(evidence => !prose.includes(evidence))) return NextResponse.json({ error: '현재 원고에서 찾을 수 없는 근거가 있습니다.' }, { status: 400 });
  if (parsed.data.states.some(value => value.warning)) return NextResponse.json({ error: '대상을 찾지 못한 상태 후보는 반영할 수 없습니다.' }, { status: 400 });
  if (parsed.data.states.some(value => (value.subjectType === 'character' && !value.characterId) ||
    (value.subjectType === 'world' && !value.worldEntryId) ||
    (value.knowledgeScope === 'character' && !value.knowerCharacterId))) {
    return NextResponse.json({ error: '상태 또는 정보의 연결 대상을 선택해주세요.' }, { status: 400 });
  }
  const [characters, worlds] = await Promise.all([listCharacters(db, id), listWorldEntries(db, id)]);
  const characterIds = new Set(characters.map(value => value.id)); const worldIds = new Set(worlds.map(value => value.id));
  if (parsed.data.states.some(value => (value.characterId && !characterIds.has(value.characterId)) || (value.worldEntryId && !worldIds.has(value.worldEntryId)) ||
    (value.knowerCharacterId && !characterIds.has(value.knowerCharacterId)))) return NextResponse.json({ error: '다른 작품의 대상을 반영할 수 없습니다.' }, { status: 400 });
  const keys = parsed.data.states.map(value => [value.category, value.label, value.characterId, value.worldEntryId, value.knowledgeScope, value.knowerCharacterId].join('|'));
  if (new Set(keys).size !== keys.length) return NextResponse.json({ error: '같은 상태 변경 후보가 중복되었습니다.' }, { status: 400 });
  const calendar = getStoryCalendar(project.settingsJson);
  if (parsed.data.storyDate && ((parsed.data.storyDate.storyMonth ?? 1) > calendar.monthsPerYear || (parsed.data.storyDate.storyDay ?? 1) > calendar.daysPerMonth)) return NextResponse.json({ error: '작품 달력의 날짜 범위를 벗어났습니다.' }, { status: 400 });
  try {
    const applied = applyChapterCloseout(db, id, chapterId, parsed.data);
    return NextResponse.json({ applied, chapter: await getChapter(db, chapterId) });
  } catch (error) {
    if (error instanceof Error && error.message === 'CLOSEOUT_ALREADY_APPLIED') return NextResponse.json({ error: '같은 원고의 마감 결과가 이미 반영되었습니다.' }, { status: 409 });
    return NextResponse.json({ error: '마감 결과를 반영하지 못했습니다.' }, { status: 500 });
  }
}
