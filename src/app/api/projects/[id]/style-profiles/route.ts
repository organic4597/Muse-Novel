import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import {
  createWritingStyleProfile,
  listWritingStyleProfiles,
} from '@/lib/db/queries/writing-style-profiles';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProject(db, id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const profiles = await listWritingStyleProfiles(db, id);
  return NextResponse.json(profiles);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name } = (await req.json()) as { name: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const project = await getProject(db, id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const profile = await createWritingStyleProfile(db, id, name.trim());
  return NextResponse.json(profile, { status: 201 });
}
