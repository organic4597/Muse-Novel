import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteWritingStyleProfile,
  getWritingStyleProfile,
  updateWritingStyleProfile,
} from '@/lib/db/queries/writing-style-profiles';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const body = (await req.json()) as { name?: string; description?: string | null };

  const profile = await getWritingStyleProfile(db, profileId);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const updated = await updateWritingStyleProfile(db, profileId, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;

  const profile = await getWritingStyleProfile(db, profileId);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (profile.filePath) {
    const { unlink } = await import('fs/promises');
    const path = await import('path');
    const filePath = path.join(process.cwd(), 'public', profile.filePath);
    try {
      await unlink(filePath);
    } catch {
      // ignore
    }
  }

  await deleteWritingStyleProfile(db, profileId);
  return NextResponse.json({ ok: true });
}
