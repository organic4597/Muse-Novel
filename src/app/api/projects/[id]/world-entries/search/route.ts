import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { searchWorldEntries } from '@/lib/db/queries/world-entry-links';

const DEPRECATION_HEADERS = {
  Deprecation: 'true',
  Link: '</api/projects/{id}/world-entries>; rel="successor-version"',
  Sunset: 'Mon, 01 Mar 2027 00:00:00 GMT',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  if (!q || !q.trim()) {
    return NextResponse.json([], { headers: DEPRECATION_HEADERS });
  }

  const results = await searchWorldEntries(db, id, q.trim());

  return NextResponse.json(results, { headers: DEPRECATION_HEADERS });
}
