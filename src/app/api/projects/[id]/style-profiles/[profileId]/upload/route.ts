import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  getWritingStyleProfile,
  updateWritingStyleProfile,
} from '@/lib/db/queries/writing-style-profiles';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  const { id, profileId } = await params;

  const profile = await getWritingStyleProfile(db, profileId);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: '텍스트 파일이 필요합니다.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: '파일 크기는 10MB를 초과할 수 없습니다.' },
      { status: 400 }
    );
  }

  const ext = path.extname(file.name).toLowerCase();
  if (ext !== '.txt') {
    return NextResponse.json(
      { error: '.txt 파일만 업로드할 수 있습니다.' },
      { status: 400 }
    );
  }

  const filename = `${crypto.randomUUID()}.txt`;
  const uploadDir = path.join(
    process.cwd(),
    'public',
    'uploads',
    'styles',
    id,
    profileId
  );
  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, filename), buffer);

  // Remove old file if exists
  if (profile.filePath) {
    const { unlink } = await import('fs/promises');
    const oldFilePath = path.join(process.cwd(), 'public', profile.filePath);
    try {
      await unlink(oldFilePath);
    } catch {
      // Ignore if old file doesn't exist
    }
  }

  const filePath = `/uploads/styles/${id}/${profileId}/${filename}`;
  const updated = await updateWritingStyleProfile(db, profileId, { filePath });

  return NextResponse.json(updated);
}
