import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { createProject, listProjects } from '@/lib/db/queries/projects';
import { observeApiHandler } from '@/lib/observability/server-metrics';

async function getProjects() {
  const projects = await listProjects(db);

  return NextResponse.json(projects);
}

async function createProjectHandler(request: Request) {
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

export const GET = observeApiHandler('/api/projects', 'GET', getProjects);
export const POST = observeApiHandler(
  '/api/projects',
  'POST',
  createProjectHandler
);
