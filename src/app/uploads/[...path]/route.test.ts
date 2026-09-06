import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRequestSession } from '@/lib/auth/request';

import { GET, HEAD } from './route';

vi.mock('@/lib/auth/request', () => ({
  getRequestSession: vi.fn(),
}));

let temporaryDirectory = '';
const previousUploadsDir = process.env.UPLOADS_DIR;

describe('/uploads/[...path]', () => {
  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'muse-uploads-'));
    process.env.UPLOADS_DIR = temporaryDirectory;
    vi.mocked(getRequestSession).mockResolvedValue({ sessionId: 'test' } as never);
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { force: true, recursive: true });
    if (previousUploadsDir === undefined) {
      Reflect.deleteProperty(process.env, 'UPLOADS_DIR');
    }
    else process.env.UPLOADS_DIR = previousUploadsDir;
    vi.clearAllMocks();
  });

  it('requires a valid session even when proxy matching is bypassed', async () => {
    vi.mocked(getRequestSession).mockResolvedValue(null);
    const response = await GET(
      new NextRequest('http://localhost/uploads/characters/id/portrait.png'),
      { params: Promise.resolve({ path: ['characters', 'id', 'portrait.png'] }) }
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('streams a persistent upload with private caching and supports HEAD', async () => {
    const directory = path.join(temporaryDirectory, 'characters', 'id');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'portrait.png'), Buffer.from('image'));
    const context = {
      params: Promise.resolve({ path: ['characters', 'id', 'portrait.png'] }),
    };

    const response = await GET(
      new NextRequest('http://localhost/uploads/characters/id/portrait.png'),
      context
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('private');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('image');

    const head = await HEAD(
      new NextRequest('http://localhost/uploads/characters/id/portrait.png'),
      context
    );
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('5');
  });
});
