import { mkdir, unlink, writeFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import path from 'path';

import { db } from '@/lib/db';
import { getCharacter, updateCharacter } from '@/lib/db/queries/characters';
import {
  createUploadWebPath,
  findExistingUploadPath,
  getUploadWritePath,
} from '@/lib/uploads/storage';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;

  const character = await getCharacter(db, characterId);
  if (!character) {
    return NextResponse.json(
      { error: '캐릭터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('image');

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: '이미지 파일이 필요합니다.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: '파일 크기는 5MB를 초과할 수 없습니다.' },
      { status: 400 }
    );
  }

  const originalExt = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(originalExt)) {
    return NextResponse.json(
      { error: '허용되지 않는 파일 형식입니다. (jpg, jpeg, png, webp, gif만 가능)' },
      { status: 400 }
    );
  }

  const filename = `${crypto.randomUUID()}${originalExt}`;
  const imagePath = createUploadWebPath('characters', characterId, filename);
  const absolutePath = getUploadWritePath(imagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  // Remove old image if exists
  if (character.imagePath) {
    try {
      await unlink(await findExistingUploadPath(character.imagePath));
    } catch {
      // Ignore if old file doesn't exist
    }
  }

  const updated = await updateCharacter(db, characterId, { imagePath });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;

  const character = await getCharacter(db, characterId);
  if (!character) {
    return NextResponse.json(
      { error: '캐릭터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  if (character.imagePath) {
    try {
      await unlink(await findExistingUploadPath(character.imagePath));
    } catch {
      // Ignore if file doesn't exist
    }
  }

  const updated = await updateCharacter(db, characterId, { imagePath: null });

  return NextResponse.json(updated);
}
