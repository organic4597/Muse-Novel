import { unlink } from 'fs/promises';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteCharacterImage,
  getCharacterImage,
  setPrimaryImage,
} from '@/lib/db/queries/character-images';
import { findExistingUploadPath } from '@/lib/uploads/storage';

/** PATCH: Set as primary / PUT: Set as primary */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string; imageId: string }> }
) {
  const { imageId, characterId } = await params;
  const body = await request.json();

  if (body.isPrimary) {
    const result = await setPrimaryImage(db, imageId);
    if (!result) {
      return NextResponse.json(
        { error: '이미지를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: '지원되지 않는 작업입니다.' }, { status: 400 });
}

/** DELETE: Remove an image from the gallery */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; characterId: string; imageId: string }> }
) {
  const { imageId } = await params;

  const image = await getCharacterImage(db, imageId);
  if (!image) {
    return NextResponse.json(
      { error: '이미지를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  // Delete file from disk
  try {
    await unlink(await findExistingUploadPath(image.imagePath));
  } catch {
    // Ignore if file doesn't exist
  }

  await deleteCharacterImage(db, imageId);

  return NextResponse.json({ ok: true });
}
