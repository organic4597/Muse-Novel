import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { assignStyleProfileToProject, getWritingStyleProfile } from '@/lib/db/queries/writing-style-profiles';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { profileId } = (await req.json()) as { profileId: string | null };

  const project = await getProject(db, id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (profileId !== null) {
    const profile = await getWritingStyleProfile(db, profileId);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
  }

  const updated = await assignStyleProfileToProject(db, id, profileId);
  return NextResponse.json(updated);
}
