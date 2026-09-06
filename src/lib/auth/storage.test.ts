import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureSessionSecret, readSessionSecret } from './storage';

let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'muse-auth-storage-'));
  process.env.MUSE_AUTH_DATA_DIR = temporaryDirectory;
});

afterEach(async () => {
  Reflect.deleteProperty(process.env, 'MUSE_AUTH_DATA_DIR');
  await rm(temporaryDirectory, { force: true, recursive: true });
});

describe('authentication file storage', () => {
  it('atomically creates one session secret under concurrent first access', async () => {
    const secrets = await Promise.all(
      Array.from({ length: 12 }, async () => ensureSessionSecret())
    );
    expect(new Set(secrets.map((secret) => secret.toString('hex'))).size).toBe(1);
    const encoded = (await readFile(path.join(temporaryDirectory, 'session-secret'), 'utf8')).trim();
    expect(encoded).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect((await readdir(temporaryDirectory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects a malformed existing secret rather than silently replacing it', async () => {
    await writeFile(path.join(temporaryDirectory, 'session-secret'), 'not-a-valid-secret\n', {
      mode: 0o600,
    });
    await expect(ensureSessionSecret()).rejects.toThrow('Invalid session secret');
    await expect(readSessionSecret()).resolves.toBeNull();
  });

  it('repairs overly broad secret permissions on POSIX hosts', async () => {
    if (process.platform === 'win32') {
      return;
    }
    await ensureSessionSecret();
    const filePath = path.join(temporaryDirectory, 'session-secret');
    await chmod(filePath, 0o644);
    await expect(readSessionSecret()).resolves.toHaveLength(32);
    expect((await stat(filePath)).mode & 0o077).toBe(0);
  });
});
