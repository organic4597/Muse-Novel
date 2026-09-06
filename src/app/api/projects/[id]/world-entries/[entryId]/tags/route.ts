import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  addTag,
  deleteTag,
  listTags,
} from '@/lib/db/queries/world-entry-tags';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { entryId } = await params;
  const tags = await listTags(db, entryId);

  return NextResponse.json(tags);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { entryId } = await params;
  const body = await request.json();

  if (!body.tag || typeof body.tag !== 'string' || !body.tag.trim()) {
    return NextResponse.json(
      { error: '태그는 필수입니다.' },
      { status: 400 }
    );
  }

  const tag = await addTag(db, entryId, body.tag.trim());

  return NextResponse.json(tag, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { entryId: _entryId } = await params;
  const body = await request.json();

  if (!body.tagId || typeof body.tagId !== 'string') {
    return NextResponse.json(
      { error: '태그 ID는 필수입니다.' },
      { status: 400 }
    );
  }

  await deleteTag(db, body.tagId);

  return NextResponse.json({ success: true });
}
