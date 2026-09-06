import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createUploadWebPath,
  getUploadsRoot,
  getUploadWritePath,
} from './storage';

const previousUploadsDir = process.env.UPLOADS_DIR;

describe('persistent upload storage paths', () => {
  afterEach(() => {
    if (previousUploadsDir === undefined) {
      Reflect.deleteProperty(process.env, 'UPLOADS_DIR');
    }
    else process.env.UPLOADS_DIR = previousUploadsDir;
  });

  it('resolves new uploads beneath the configured persistent root', () => {
    process.env.UPLOADS_DIR = path.resolve('data', 'test-uploads');
    const webPath = createUploadWebPath(
      'characters',
      'character-1',
      'portrait.png'
    );

    expect(webPath).toBe('/uploads/characters/character-1/portrait.png');
    expect(getUploadWritePath(webPath)).toBe(
      path.join(getUploadsRoot(), 'characters', 'character-1', 'portrait.png')
    );
  });

  it('rejects traversal, query tricks, and unexpected characters', () => {
    expect(() => getUploadWritePath('/uploads/../secret.txt')).toThrow(
      '안전하지 않은 업로드 경로'
    );
    expect(() => getUploadWritePath('/uploads/characters/%2e%2e/key')).toThrow(
      '안전하지 않은 업로드 경로'
    );
    expect(() => getUploadWritePath('/public/portrait.png')).toThrow(
      '/uploads/'
    );
  });
});
