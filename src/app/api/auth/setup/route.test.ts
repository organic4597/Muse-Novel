import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readCredential } from '@/lib/auth/storage';
import { resetLoginThrottleForTests } from '@/lib/auth/throttle';

import { POST } from './route';

let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'muse-auth-setup-'));
  process.env.MUSE_AUTH_DATA_DIR = temporaryDirectory;
  Reflect.deleteProperty(process.env, 'MUSE_AUTH_SETUP_TOKEN');
  resetLoginThrottleForTests();
});

afterEach(async () => {
  Reflect.deleteProperty(process.env, 'MUSE_AUTH_DATA_DIR');
  Reflect.deleteProperty(process.env, 'MUSE_AUTH_SETUP_TOKEN');
  await rm(temporaryDirectory, { force: true, recursive: true });
});

function setupRequest(body: Record<string, unknown>) {
  return new NextRequest('http://muse.local/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://muse.local' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/setup', () => {
  it(
    'creates the only admin with OWASP-strength scrypt and never stores plaintext',
    async () => {
      const password = 'long-unique-password';
      const response = await POST(
        setupRequest({ username: 'admin', password, returnTo: '/projects' })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('set-cookie')).toContain('HttpOnly');
      const credential = await readCredential();
      expect(credential?.password.parameters).toMatchObject({ N: 2 ** 17, r: 8, p: 1 });
      expect(credential?.password.salt).toBeTruthy();
      expect(credential?.password.hash).toBeTruthy();
      const stored = await readFile(path.join(temporaryDirectory, 'credential.json'), 'utf8');
      expect(stored).not.toContain(password);
    },
    15_000
  );

  it('does not permit a second administrator setup', async () => {
    const first = await POST(
      setupRequest({ username: 'admin', password: 'long-unique-password' })
    );
    expect(first.status).toBe(200);
    const second = await POST(
      setupRequest({ username: 'other', password: 'another-long-password' })
    );
    expect(second.status).toBe(409);
  });

  it('requires the deployment setup code before creating credentials', async () => {
    process.env.MUSE_AUTH_SETUP_TOKEN = 'server-generated-setup-code';
    const missing = await POST(
      setupRequest({ username: 'admin', password: 'long-unique-password' })
    );
    expect(missing.status).toBe(400);
    expect(await readCredential()).toBeNull();

    const valid = await POST(
      setupRequest({
        username: 'admin',
        password: 'long-unique-password',
        setupToken: 'server-generated-setup-code',
      })
    );
    expect(valid.status).toBe(200);
    expect(await readCredential()).not.toBeNull();
  });
});
