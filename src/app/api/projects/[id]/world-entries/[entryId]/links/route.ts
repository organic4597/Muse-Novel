import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  createLink,
  deleteLink,
  getLinksForEntry,
} from '@/lib/db/queries/world-entry-links';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { entryId } = await params;

  const links = await getLinksForEntry(db, entryId);

  return NextResponse.json(links);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { entryId } = await params;
  const body = await request.json();

  if (!body.targetId || typeof body.targetId !== 'string') {
    return NextResponse.json(
      { error: '대상 항목 ID는 필수입니다.' },
      { status: 400 }
    );
  }

  if (entryId === body.targetId) {
    return NextResponse.json(
      { error: '자기 자신에게 링크할 수 없습니다.' },
      { status: 400 }
    );
  }

  const link = await createLink(db, entryId, body.targetId);

  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  await params;
  const url = new URL(request.url);
  const linkId = url.searchParams.get('linkId');

  if (!linkId) {
    return NextResponse.json(
      { error: '링크 ID는 필수입니다.' },
      { status: 400 }
    );
  }

  await deleteLink(db, linkId);

  return NextResponse.json({ success: true });
}
