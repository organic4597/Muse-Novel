import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SESSION_DURATION_SECONDS } from './constants';
import { createSessionToken, validateSessionToken } from './session';
import { createInitialCredential, incrementSessionEpoch } from './storage';
import type { AuthCredential } from './types';

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
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'muse-auth-session-'));
  process.env.MUSE_AUTH_DATA_DIR = temporaryDirectory;
  await createInitialCredential(testCredential());
});

it('limits newly issued login sessions to exactly 24 hours', async () => {
  const now = Date.now();
  const { claims } = await createSessionToken(now);
  expect(SESSION_DURATION_SECONDS).toBe(60 * 60 * 24);
  expect(claims.expiresAt - claims.issuedAt).toBe(60 * 60 * 24);
});

afterEach(async () => {
  Reflect.deleteProperty(process.env, 'MUSE_AUTH_DATA_DIR');
  await rm(temporaryDirectory, { force: true, recursive: true });
});

describe('signed sessions', () => {
  it('accepts a valid signed token and rejects tampering', async () => {
    const now = 1_800_000_000_000;
    const { claims, token } = await createSessionToken(now);
    await expect(validateSessionToken(token, now + 1000)).resolves.toMatchObject({
      epoch: 0,
      sessionId: claims.sessionId,
    });

    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    await expect(validateSessionToken(tampered, now + 1000)).resolves.toBeNull();
  });

  it('rejects expired sessions and revokes existing sessions by epoch', async () => {
    const now = 1_800_000_000_000;
    const { claims, token } = await createSessionToken(now);
    await expect(validateSessionToken(token, claims.expiresAt * 1000)).resolves.toBeNull();

    await incrementSessionEpoch();
    await expect(validateSessionToken(token, now + 1000)).resolves.toBeNull();
  });
});
