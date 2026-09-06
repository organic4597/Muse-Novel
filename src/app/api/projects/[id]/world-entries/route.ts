import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  createWorldEntry,
  listWorldEntries,
} from '@/lib/db/queries/world-entries';
import { observeApiHandler } from '@/lib/observability/server-metrics';
import { readResearchJson } from '@/lib/web-research/content';

async function getWorldEntries(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const category = url.searchParams.get('category') ?? undefined;
  const tag = url.searchParams.get('tag') ?? undefined;

  if (tag) {
    const { listEntriesByTag } = await import(
      '@/lib/db/queries/world-entry-tags'
    );
    const entries = await listEntriesByTag(db, id, tag);
    return NextResponse.json(entries);
  }

  const entries = await listWorldEntries(db, id, { category });

  return NextResponse.json(entries);
}

async function createWorldEntryHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json(
      { error: '제목은 필수입니다.' },
      { status: 400 }
    );
  }

  if (!body.category || typeof body.category !== 'string' || !body.category.trim()) {
    return NextResponse.json(
      { error: '카테고리는 필수입니다.' },
      { status: 400 }
    );
  }

  const entry = await createWorldEntry(db, {
    projectId: id,
    title: body.title.trim(),
    category: body.category.trim(),
    content: body.content ?? undefined,
    researchJson: typeof body.researchJson === 'string' && readResearchJson(body.researchJson) ? body.researchJson : null,
  });

  return NextResponse.json(entry, { status: 201 });
}

export const GET = observeApiHandler(
  '/api/projects/[id]/world-entries',
  'GET',
  getWorldEntries
);
export const POST = observeApiHandler(
  '/api/projects/[id]/world-entries',
  'POST',
  createWorldEntryHandler
);
