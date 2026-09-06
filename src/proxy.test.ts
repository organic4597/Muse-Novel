import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { unstable_doesMiddlewareMatch as doesProxyMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSessionToken } from '@/lib/auth/session';
import { createInitialCredential } from '@/lib/auth/storage';
import type { AuthCredential } from '@/lib/auth/types';

import { config, proxy } from './proxy';

let temporaryDirectory: string;

function testCredential(): AuthCredential {
  const timestamp = new Date(0).toISOString();
  return {
    schemaVersion: 1,
    username: 'admin',
    password: {
      algorithm: 'scrypt',
      version: 1,
      salt: Buffer.alloc(32).toString('base64url'),
      hash: Buffer.alloc(32).toString('base64url'),
      parameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32, maxmem: 8 * 1024 * 1024 },
    },
    sessionEpoch: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'muse-auth-proxy-'));
  process.env.MUSE_AUTH_DATA_DIR = temporaryDirectory;
});

afterEach(async () => {
  Reflect.deleteProperty(process.env, 'MUSE_AUTH_DATA_DIR');
  await rm(temporaryDirectory, { force: true, recursive: true });
});

describe('authentication proxy', () => {
  it('protects user uploads and the image optimizer while leaving build assets public', () => {
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: '/uploads/characters/hero/portrait.png',
      })
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: '/_next/image?url=%2Fuploads%2Fcharacters%2Fhero%2Fportrait.png',
      })
    ).toBe(true);
    expect(
      doesProxyMatch({
        config,
        nextConfig: {},
        url: '/_next/static/chunks/app.js',
      })
    ).toBe(false);
  });

  it('sends the first browser visit to setup while leaving health public', async () => {
    const pageResponse = await proxy(
      new NextRequest('http://muse.local/projects/novel?tab=write')
    );
    expect(pageResponse.status).toBe(307);
    expect(pageResponse.headers.get('location')).toBe(
      'http://muse.local/setup?returnTo=%2Fprojects%2Fnovel%3Ftab%3Dwrite'
    );

    const healthResponse = await proxy(new NextRequest('http://muse.local/api/health'));
    expect(healthResponse.headers.get('x-middleware-next')).toBe('1');
  });

  it('returns JSON errors for protected APIs instead of redirecting', async () => {
    await createInitialCredential(testCredential());
    const response = await proxy(new NextRequest('http://muse.local/api/projects'));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('allows a cryptographically valid session and rejects a forged one', async () => {
    await createInitialCredential(testCredential());
    const { token } = await createSessionToken();
    const validResponse = await proxy(
      new NextRequest('http://muse.local/api/projects', {
        headers: { cookie: `muse_session=${token}` },
      })
    );
    expect(validResponse.headers.get('x-middleware-next')).toBe('1');

    const forgedResponse = await proxy(
      new NextRequest('http://muse.local/api/projects', {
        headers: { cookie: 'muse_session=forged.value' },
      })
    );
    expect(forgedResponse.status).toBe(401);
  });

  it('centrally rejects mutation requests without an exact Origin', async () => {
    await createInitialCredential(testCredential());
    const { token } = await createSessionToken();
    const missingMetadata = await proxy(
      new NextRequest('http://muse.local/api/projects', {
        method: 'POST',
        headers: { cookie: `muse_session=${token}` },
      })
    );
    expect(missingMetadata.status).toBe(403);
    await expect(missingMetadata.json()).resolves.toMatchObject({
      code: 'UNSAFE_REQUEST_ORIGIN',
    });

    const safeMutation = await proxy(
      new NextRequest('http://muse.local/api/projects', {
        method: 'POST',
        headers: {
          cookie: `muse_session=${token}`,
          origin: 'http://muse.local',
          'sec-fetch-site': 'same-origin',
        },
      })
    );
    expect(safeMutation.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets LAN HTTP setup reach token validation without Fetch Metadata', async () => {
    const response = await proxy(
      new NextRequest('http://internal-container:3000/api/auth/setup', {
        method: 'POST',
        headers: {
          host: '192.0.2.10:3210',
          origin: 'http://192.0.2.10:3210',
          'content-type': 'application/json',
        },
        body: '{}',
      })
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
