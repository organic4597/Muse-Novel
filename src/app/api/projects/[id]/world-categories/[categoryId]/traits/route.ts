import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { setWorldCategoryTraits, WorldCategoryRenameError } from '@/lib/db/queries/world-categories';
import { WORLD_CATEGORY_TRAITS } from '@/lib/world-categories';

const schema = z.object({ traits: z.array(z.enum(WORLD_CATEGORY_TRAITS)).max(WORLD_CATEGORY_TRAITS.length) });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; categoryId: string }> }) {
  const { id, categoryId } = await params;
  if (!(await getProject(db, id))) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '카테고리 특성을 확인해주세요.' }, { status: 400 });
  try {
    return NextResponse.json(await setWorldCategoryTraits(db, id, categoryId, parsed.data.traits));
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorldCategoryRenameError ? error.message : '카테고리 특성을 저장하지 못했습니다.' },
      { status: error instanceof WorldCategoryRenameError ? 404 : 500 });
  }
}
