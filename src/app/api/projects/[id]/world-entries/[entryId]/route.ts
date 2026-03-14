import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteWorldEntry,
  getWorldEntry,
  updateWorldEntry,
} from '@/lib/db/queries/world-entries';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { entryId } = await params;
  const entry = await getWorldEntry(db, entryId);

  if (!entry) {
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
  const { entryId } = await params;
  const body = await request.json();

  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim())) {
    return NextResponse.json(
      { error: '제목은 필수입니다.' },
      { status: 400 }
    );
  }

  const updated = await updateWorldEntry(db, entryId, {
    title: body.title?.trim() ?? undefined,
    category: body.category?.trim() ?? undefined,
    content: body.content ?? undefined,
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
  const { entryId } = await params;
  const existing = await getWorldEntry(db, entryId);

  if (!existing) {
    return NextResponse.json(
      { error: '항목을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  await deleteWorldEntry(db, entryId);

  return NextResponse.json({ success: true });
}
