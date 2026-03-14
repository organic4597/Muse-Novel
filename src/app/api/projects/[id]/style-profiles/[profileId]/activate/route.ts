import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import {
  assignStyleProfileToProject,
  getWritingStyleProfile,
} from '@/lib/db/queries/writing-style-profiles';

/** @deprecated Use PATCH /api/projects/[id]/style-profiles/assign instead. */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  const { id, profileId } = await params;

  const project = await getProject(db, id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const profile = await getWritingStyleProfile(db, profileId);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const updated = await assignStyleProfileToProject(db, id, profileId);
  return NextResponse.json(updated);
}
