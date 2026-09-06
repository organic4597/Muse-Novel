import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';

import { getRequestSession } from '@/lib/auth/request';
import {
  createUploadWebPath,
  findExistingUploadPath,
} from '@/lib/uploads/storage';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

async function serveUpload(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
  includeBody: boolean
) {
  if (!(await getRequestSession(request))) {
    return Response.json(
      { code: 'AUTH_REQUIRED', error: '로그인이 필요합니다.' },
      {
        headers: { 'Cache-Control': 'private, no-store' },
        status: 401,
      }
    );
  }

  try {
    const { path: segments } = await params;
    const webPath = createUploadWebPath(...segments);
    const filePath = await findExistingUploadPath(webPath);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return new Response('Not found', { status: 404 });

    const etag = `"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}"`;
    const headers = new Headers({
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': fileStat.size.toString(),
      'Content-Type':
        CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
        'application/octet-stream',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    });

    if (request.headers.get('if-none-match') === etag) {
      headers.delete('Content-Length');
      return new Response(null, { headers, status: 304 });
    }
    if (!includeBody) return new Response(null, { headers });

    const stream = Readable.toWeb(createReadStream(filePath));
    return new Response(stream as ReadableStream, { headers });
  } catch {
    return new Response('Not found', {
      headers: { 'Cache-Control': 'private, no-store' },
      status: 404,
    });
  }
}

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return serveUpload(request, params, true);
}

export function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return serveUpload(request, params, false);
}
