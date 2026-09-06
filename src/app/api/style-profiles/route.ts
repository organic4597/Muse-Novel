import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  createWritingStyleProfile,
  listAllWritingStyleProfiles,
} from '@/lib/db/queries/writing-style-profiles';

export async function GET() {
  const profiles = await listAllWritingStyleProfiles(db);
  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  const { name } = (await req.json()) as { name: string };
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const profile = await createWritingStyleProfile(db, name.trim());
  return NextResponse.json(profile, { status: 201 });
}
