import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { createWorldCategory, deleteWorldCategory, listWorldCategories, renameWorldCategory, WorldCategoryDeleteError, WorldCategoryRenameError } from '@/lib/db/queries/world-categories';

const categorySchema = z.object({
  name: z.string().normalize('NFKC').trim().min(1).max(50)
    .refine((name) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json(await listWorldCategories(db, id));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  const parsed = categorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '카테고리 이름을 1~50자로 입력하세요.' }, { status: 400 });
  }
  const name = await createWorldCategory(db, id, parsed.data.name);
  return NextResponse.json({ name });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getProject(db, id))) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  const parsed = categorySchema.extend({ oldName: categorySchema.shape.name }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '카테고리 이름을 1~50자로 입력하세요.' }, { status: 400 });
  try {
    return NextResponse.json(await renameWorldCategory(db, id, parsed.data.oldName, parsed.data.name));
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorldCategoryRenameError ? error.message : '이름을 변경하지 못했습니다. 다시 시도해주세요.' },
      { status: error instanceof WorldCategoryRenameError ? 409 : 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getProject(db, id))) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  const parsed = categorySchema.extend({ targetName: categorySchema.shape.name }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '삭제할 카테고리와 항목을 이동할 카테고리를 선택해주세요.' }, { status: 400 });
  try {
    return NextResponse.json(await deleteWorldCategory(db, id, parsed.data.name, parsed.data.targetName));
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorldCategoryDeleteError ? error.message : '카테고리를 삭제하지 못했습니다. 다시 시도해주세요.' },
      { status: error instanceof WorldCategoryDeleteError ? 409 : 500 });
  }
}
