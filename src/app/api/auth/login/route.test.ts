import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { createInitialCredential } from '@/lib/auth/storage';
import { resetLoginThrottleForTests } from '@/lib/auth/throttle';

import { POST } from './route';

let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'muse-auth-login-'));
  process.env.MUSE_AUTH_DATA_DIR = temporaryDirectory;
  resetLoginThrottleForTests();
  const timestamp = new Date().toISOString();
  await createInitialCredential({
    schemaVersion: 1,
    username: 'admin',
    password: await hashPassword('correct-test-password', {
      N: 2 ** 10,
      r: 8,
      p: 1,
      keyLength: 32,
      maxmem: 8 * 1024 * 1024,
    }),
    sessionEpoch: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
});

afterEach(async () => {
  Reflect.deleteProperty(process.env, 'MUSE_AUTH_DATA_DIR');
  Reflect.deleteProperty(process.env, 'AUTH_TRUST_PROXY');
  await rm(temporaryDirectory, { force: true, recursive: true });
});

function loginRequest(username: string, password: string) {
  return new NextRequest('http://muse.local/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://muse.local',
      'x-forwarded-for': '192.0.2.10',
    },
    body: JSON.stringify({ username, password, returnTo: '/projects' }),
  });
}

describe('POST /api/auth/login', () => {
  it('sets a hardened session cookie after valid credentials', async () => {
    const response = await POST(loginRequest('ADMIN', 'correct-test-password'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      redirectTo: '/projects',
    });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('muse_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Priority=high');
    expect(cookie).not.toContain('Secure');
  });

  it('marks the session cookie Secure when HTTPS is forwarded', async () => {
    process.env.AUTH_TRUST_PROXY = '1';
    const request = loginRequest('admin', 'correct-test-password');
    request.headers.set('origin', 'https://muse.local');
    request.headers.set('x-forwarded-proto', 'https');
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });

  it('returns the same generic error for a wrong user and a wrong password', async () => {
    const wrongUser = await POST(loginRequest('somebody', 'correct-test-password'));
    const wrongPassword = await POST(loginRequest('admin', 'incorrect-test-password'));
    expect(wrongUser.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect((await wrongUser.json()).error).toBe((await wrongPassword.json()).error);
  });

  it('rejects a cross-origin login request', async () => {
    const request = loginRequest('admin', 'correct-test-password');
    request.headers.set('origin', 'http://evil.example');
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('rate limits repeated failures before another expensive password check', async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await POST(loginRequest('admin', 'incorrect-test-password'));
      expect(response.status).toBe(401);
    }
    const blocked = await POST(loginRequest('admin', 'incorrect-test-password'));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });
});
