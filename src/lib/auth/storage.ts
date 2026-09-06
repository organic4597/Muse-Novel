import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';

import type { AuthCredential } from './types';

const CREDENTIAL_FILENAME = 'credential.json';
const SESSION_SECRET_FILENAME = 'session-secret';
const LOCK_FILENAME = '.credential.lock';
const LOCK_STALE_MS = 60_000;
const LOCK_RETRY_COUNT = 50;
const LOCK_RETRY_DELAY_MS = 20;

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function isExistingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'EEXIST';
}

function decodeSessionSecret(encoded: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(encoded)) {
    return null;
  }
  const secret = Buffer.from(encoded, 'base64url');
  return secret.length === 32 && secret.toString('base64url') === encoded ? secret : null;
}

export function getAuthDirectory(): string {
  const explicitDirectory = process.env.MUSE_AUTH_DATA_DIR?.trim();
  if (explicitDirectory) {
    return path.resolve(explicitDirectory);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl && databaseUrl !== ':memory:' && !databaseUrl.startsWith('file:')) {
    return path.join(path.dirname(path.resolve(databaseUrl)), 'auth');
  }

  return path.resolve('data', 'auth');
}

function credentialPath(): string {
  return path.join(getAuthDirectory(), CREDENTIAL_FILENAME);
}

function sessionSecretPath(): string {
  return path.join(getAuthDirectory(), SESSION_SECRET_FILENAME);
}

async function ensureDirectory(): Promise<void> {
  const directory = getAuthDirectory();
  await mkdir(directory, { mode: 0o700, recursive: true });
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error('Authentication data path is not a secure directory');
  }
  if (process.platform !== 'win32' && (details.mode & 0o077) !== 0) {
    await chmod(directory, 0o700);
    const secured = await lstat(directory);
    if ((secured.mode & 0o077) !== 0) {
      throw new Error('Authentication directory permissions are too broad');
    }
  }
}

async function fsyncParentDirectory(filePath: string): Promise<void> {
  let directoryHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    directoryHandle = await open(path.dirname(filePath), 'r');
    await directoryHandle.sync();
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error;
    }
  } finally {
    await directoryHandle?.close().catch(() => undefined);
  }
}

async function hardenAndValidateFile(filePath: string, maximumBytes: number): Promise<void> {
  let details = await lstat(filePath);
  if (!details.isFile() || details.isSymbolicLink() || details.size > maximumBytes) {
    throw new Error('Authentication data file is invalid');
  }
  if (process.platform !== 'win32' && (details.mode & 0o077) !== 0) {
    await chmod(filePath, 0o600);
    details = await lstat(filePath);
    if ((details.mode & 0o077) !== 0) {
      throw new Error('Authentication file permissions are too broad');
    }
  }
}

async function atomicWrite(filePath: string, contents: string): Promise<void> {
  await ensureDirectory();
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(contents, { encoding: 'utf8' });
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(temporaryPath, filePath);
    await hardenAndValidateFile(filePath, 64 * 1024);
    await fsyncParentDirectory(filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function atomicCreate(filePath: string, contents: string): Promise<boolean> {
  await ensureDirectory();
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(contents, { encoding: 'utf8' });
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await link(temporaryPath, filePath);
    await hardenAndValidateFile(filePath, 4096);
    await fsyncParentDirectory(filePath);
    return true;
  } catch (error) {
    if (isExistingFile(error)) {
      return false;
    }
    throw error;
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function removeStaleLock(lockPath: string): Promise<void> {
  try {
    const details = await stat(lockPath);
    if (Date.now() - details.mtimeMs > LOCK_STALE_MS) {
      await unlink(lockPath);
    }
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
}

async function acquireCredentialLock(): Promise<Awaited<ReturnType<typeof open>> | null> {
  await ensureDirectory();
  const lockPath = path.join(getAuthDirectory(), LOCK_FILENAME);
  try {
    return await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (!isExistingFile(error)) {
      throw error;
    }
  }

  await removeStaleLock(lockPath);
  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt += 1) {
    try {
      return await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (!isExistingFile(error)) {
        throw error;
      }
      if (attempt === LOCK_RETRY_COUNT - 1) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
    }
  }
  return null;
}

async function releaseCredentialLock(
  handle: Awaited<ReturnType<typeof open>>
): Promise<void> {
  await handle.close().catch(() => undefined);
  await unlink(path.join(getAuthDirectory(), LOCK_FILENAME)).catch(() => undefined);
}

function isCredential(value: unknown): value is AuthCredential {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const credential = value as Partial<AuthCredential>;
  return (
    credential.schemaVersion === 1 &&
    typeof credential.username === 'string' &&
    credential.username.length > 0 &&
    credential.password?.algorithm === 'scrypt' &&
    credential.password.version === 1 &&
    Number.isSafeInteger(credential.sessionEpoch) &&
    Number(credential.sessionEpoch) >= 0 &&
    typeof credential.createdAt === 'string' &&
    typeof credential.updatedAt === 'string'
  );
}

export async function readCredential(): Promise<AuthCredential | null> {
  try {
    await hardenAndValidateFile(credentialPath(), 64 * 1024);
    const raw = await readFile(credentialPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isCredential(parsed) ? parsed : null;
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    return null;
  }
}

export async function hasCredential(): Promise<boolean> {
  try {
    await access(credentialPath(), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function createInitialCredential(credential: AuthCredential): Promise<boolean> {
  const lock = await acquireCredentialLock();
  if (!lock) {
    return false;
  }

  try {
    if (await hasCredential()) {
      return false;
    }
    await ensureSessionSecret();
    await atomicWrite(credentialPath(), `${JSON.stringify(credential, null, 2)}\n`);
    return true;
  } finally {
    await releaseCredentialLock(lock);
  }
}

export async function incrementSessionEpoch(): Promise<number | null> {
  const lock = await acquireCredentialLock();
  if (!lock) {
    return null;
  }

  try {
    const credential = await readCredential();
    if (!credential) {
      return null;
    }
    const nextCredential: AuthCredential = {
      ...credential,
      sessionEpoch: credential.sessionEpoch + 1,
      updatedAt: new Date().toISOString(),
    };
    await atomicWrite(credentialPath(), `${JSON.stringify(nextCredential, null, 2)}\n`);
    return nextCredential.sessionEpoch;
  } finally {
    await releaseCredentialLock(lock);
  }
}

export async function ensureSessionSecret(): Promise<Buffer> {
  await ensureDirectory();
  const filePath = sessionSecretPath();
  try {
    await hardenAndValidateFile(filePath, 4096);
    const existing = decodeSessionSecret((await readFile(filePath, 'utf8')).trim());
    if (existing) {
      return existing;
    }
    throw new Error('Invalid session secret');
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const generated = randomBytes(32);
  if (await atomicCreate(filePath, `${generated.toString('base64url')}\n`)) {
    return generated;
  }
  await hardenAndValidateFile(filePath, 4096);
  const existing = decodeSessionSecret((await readFile(filePath, 'utf8')).trim());
  if (!existing) {
    throw new Error('Invalid session secret');
  }
  return existing;
}

export async function readSessionSecret(): Promise<Buffer | null> {
  try {
    await hardenAndValidateFile(sessionSecretPath(), 4096);
    return decodeSessionSecret((await readFile(sessionSecretPath(), 'utf8')).trim());
  } catch {
    return null;
  }
}
