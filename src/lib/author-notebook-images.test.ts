import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  processAuthorNoteImage,
  removeAuthorNoteImages,
} from './author-notebook-images';
import { getUploadWritePath } from './uploads/storage';

describe('author notebook images', () => {
  let uploadsRoot: string;

  beforeEach(async () => {
    uploadsRoot = await mkdtemp(path.join(os.tmpdir(), 'muse-author-notes-'));
    process.env.UPLOADS_DIR = uploadsRoot;
  });

  afterEach(async () => {
    delete process.env.UPLOADS_DIR;
    await rm(uploadsRoot, { force: true, recursive: true });
  });

  it('normalizes an uploaded image and removes only a safe note path', async () => {
    const png = await sharp({
      create: {
        background: '#8b5cf6',
        channels: 4,
        height: 120,
        width: 200,
      },
    })
      .png()
      .toBuffer();
    const result = await processAuthorNoteImage(
      new File([new Uint8Array(png)], 'idea.png', { type: 'image/png' })
    );
    const metadata = await sharp(
      await readFile(getUploadWritePath(result.imagePath))
    ).metadata();

    expect(result.imagePath).toMatch(/^\/uploads\/author-notes\/.+\.webp$/);
    expect(metadata.format).toBe('webp');
    await removeAuthorNoteImages([result.imagePath, '/uploads/maps/keep.webp']);
    await expect(readFile(getUploadWritePath(result.imagePath))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
