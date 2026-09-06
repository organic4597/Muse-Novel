import { NextResponse } from 'next/server';
import { chapterReferencesSaveSchema } from '@/lib/chapter-references';
import { db } from '@/lib/db';
import { ChapterReferenceError, getChapterReferences, saveChapterReferences } from '@/lib/db/queries/chapter-references';

type Context = { params: Promise<{ id: string; chapterId: string }> };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof ChapterReferenceError ? error.message : '회차 등장 항목을 처리하지 못했습니다.' },
    { status: error instanceof ChapterReferenceError ? error.status : 500 });
}
export async function GET(_request: Request, context: Context) {
  try { const { id, chapterId } = await context.params; return NextResponse.json(await getChapterReferences(db, id, chapterId)); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    const { id, chapterId } = await context.params;
    const parsed = chapterReferencesSaveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '회차 등장 항목을 확인해주세요.' }, { status: 400 });
    return NextResponse.json(await saveChapterReferences(db, id, chapterId, parsed.data));
  } catch (error) { return failure(error); }
}
