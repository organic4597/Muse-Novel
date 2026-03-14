import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getProject, updateProject } from '@/lib/db/queries/projects';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as {
    styleDescription?: string;
    styleSample?: string;
  };

  const project = await getProject(db, id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  await updateProject(db, id, {
    writingStyleDescription: body.styleDescription,
    writingStyleSample: body.styleSample,
  });

  return NextResponse.json({ ok: true });
}
