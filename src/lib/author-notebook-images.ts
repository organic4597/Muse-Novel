import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { AuthorNotebookError } from '@/lib/db/queries/author-notebook';
import {
  createUploadWebPath,
  getUploadWritePath,
} from '@/lib/uploads/storage';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function readAuthorNoteUpload(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES + 100_000) {
    throw new AuthorNotebookError('노트 이미지는 8MB 이하여야 합니다.', 413);
  }
  return request.formData();
}

export async function processAuthorNoteImage(file: File) {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) {
    throw new AuthorNotebookError(
      '노트 이미지는 8MB 이하의 PNG, JPG, WebP 파일을 사용해주세요.',
      413
    );
  }
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const input = sharp(buffer, { animated: false, limitInputPixels: 24_000_000 });
    const metadata = await input.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new AuthorNotebookError('정적인 PNG, JPG, WebP 이미지만 지원합니다.');
    }
    const output = await input
      .rotate()
      .resize({
        fit: 'inside',
        height: 1600,
        width: 1600,
        withoutEnlargement: true,
      })
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    const imagePath = createUploadWebPath(
      'author-notes',
      `${crypto.randomUUID()}.webp`
    );
    const diskPath = getUploadWritePath(imagePath);
    await mkdir(path.dirname(diskPath), { recursive: true });
    await writeFile(diskPath, output.data, { flag: 'wx' });
    return {
      height: output.info.height,
      imagePath,
      width: output.info.width,
    };
  } catch (error) {
    if (error instanceof AuthorNotebookError) throw error;
    throw new AuthorNotebookError(
      '이미지를 처리하지 못했습니다. 최대 2,400만 화소의 PNG, JPG, WebP를 사용해주세요.'
    );
  }
}

export async function removeAuthorNoteImages(paths: string[]) {
  for (const imagePath of paths) {
    if (!/^\/uploads\/author-notes\/[a-f0-9-]+\.webp$/.test(imagePath)) continue;
    await unlink(getUploadWritePath(imagePath)).catch(() => undefined);
  }
}
