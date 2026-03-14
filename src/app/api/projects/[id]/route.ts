import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteProject,
  getProject,
  updateProject,
} from '@/lib/db/queries/projects';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProject(db, id);

  if (!project) {
    return NextResponse.json(
      { error: '프로젝트를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(project);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updated = await updateProject(db, id, {
    title: body.title ?? undefined,
    genre: body.genre ?? undefined,
    synopsis: body.synopsis ?? undefined,
    settingsJson: body.settingsJson ?? undefined,
  });

  if (!updated) {
    return NextResponse.json(
      { error: '프로젝트를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await getProject(db, id);

  if (!existing) {
    return NextResponse.json(
      { error: '프로젝트를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  await deleteProject(db, id);

  return NextResponse.json({ success: true });
}
