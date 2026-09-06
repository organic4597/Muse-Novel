import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  deleteProject,
  getProject,
  updateProject,
} from '@/lib/db/queries/projects';
import { removeMapImages } from '@/lib/map-images';

const updateProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    genre: z.string().max(200).nullable().optional(),
    synopsis: z.string().max(100_000).nullable().optional(),
    settingsJson: z.string().max(2_000_000).nullable().optional(),
  })
  .strict();

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
  const parsed = updateProjectSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: '프로젝트 정보 형식이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  const updated = await updateProject(db, id, {
    title: parsed.data.title,
    genre: parsed.data.genre,
    synopsis: parsed.data.synopsis,
    settingsJson: parsed.data.settingsJson,
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

  await removeMapImages(await deleteProject(db, id));

  return NextResponse.json({ success: true });
}
