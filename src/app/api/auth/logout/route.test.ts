import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSessionToken, validateSessionToken } from '@/lib/auth/session';
import { createInitialCredential } from '@/lib/auth/storage';
import type { AuthCredential } from '@/lib/auth/types';

import { POST } from './route';

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
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'muse-auth-logout-'));
  process.env.MUSE_AUTH_DATA_DIR = temporaryDirectory;
  await createInitialCredential(testCredential());
});

afterEach(async () => {
  Reflect.deleteProperty(process.env, 'MUSE_AUTH_DATA_DIR');
  await rm(temporaryDirectory, { force: true, recursive: true });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie and revokes the signed session immediately', async () => {
    const { token } = await createSessionToken();
    const response = await POST(
      new NextRequest('http://muse.local/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `muse_session=${token}`,
          origin: 'http://muse.local',
        },
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/login');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    await expect(validateSessionToken(token)).resolves.toBeNull();
  });
});
