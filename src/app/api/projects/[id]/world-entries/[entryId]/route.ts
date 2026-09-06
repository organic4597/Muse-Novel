import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteWorldEntry,
  getWorldEntry,
  updateWorldEntry,
} from '@/lib/db/queries/world-entries';
import { parseEntityPatch } from '@/lib/entity-revisions';
import { readResearchJson } from '@/lib/web-research/content';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;
  const entry = await getWorldEntry(db, entryId);

  if (!entry || entry.projectId !== id) {
    return NextResponse.json(
      { error: '항목을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(entry);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;
  const existing = await getWorldEntry(db, entryId);
  if (!existing || existing.projectId !== id) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
  let body;
  try { body = parseEntityPatch('world', await request.json()); }
  catch { return NextResponse.json({ error: '세계관 수정 값의 형식을 확인해주세요.' }, { status: 400 }); }

  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) {
    return NextResponse.json(
      { error: '제목은 필수입니다.' },
      { status: 400 }
    );
  }

  const updated = await updateWorldEntry(db, entryId, {
    title: body.title?.trim() ?? undefined,
    category: body.category?.trim() ?? undefined,
    content: body.content,
    ...(body.researchJson === undefined ? {} : {
      researchJson: typeof body.researchJson === 'string' && readResearchJson(body.researchJson) ? body.researchJson : null,
    }),
  });

  if (!updated) {
    return NextResponse.json(
      { error: '항목을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;
  const existing = await getWorldEntry(db, entryId);

  if (!existing || existing.projectId !== id) {
    return NextResponse.json(
      { error: '항목을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  await deleteWorldEntry(db, entryId);

  return NextResponse.json({ success: true });
}
