import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { searchWorldEntries } from '@/lib/db/queries/world-entry-links';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  if (!q || !q.trim()) {
    return NextResponse.json([]);
  }

  const results = await searchWorldEntries(db, id, q.trim());

  return NextResponse.json(results);
}
