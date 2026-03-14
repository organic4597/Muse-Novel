import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { createProject, listProjects } from '@/lib/db/queries/projects';

export async function GET() {
  const projects = await listProjects(db);

  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json(
      { error: '제목은 필수입니다.' },
      { status: 400 }
    );
  }

  const project = await createProject(db, {
    title: body.title.trim(),
    genre: body.genre ?? undefined,
    synopsis: body.synopsis ?? undefined,
    settingsJson: body.settingsJson ?? undefined,
  });

  return NextResponse.json(project, { status: 201 });
}
