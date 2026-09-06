import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import type { PasswordDigest, ScryptParameters } from './types';

export const DEFAULT_SCRYPT_PARAMETERS: Readonly<ScryptParameters> = Object.freeze({
  N: 2 ** 17,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 256 * 1024 * 1024,
});

const MIN_PASSWORD_BYTES = 12;
const MAX_PASSWORD_BYTES = 1024;

function deriveKey(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      parameters.keyLength,
      {
        N: parameters.N,
        maxmem: parameters.maxmem,
        p: parameters.p,
        r: parameters.r,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function areSafeParameters(parameters: ScryptParameters): boolean {
  const estimatedMemory = 128 * parameters.N * parameters.r;
  return (
    isPowerOfTwo(parameters.N) &&
    parameters.N >= 2 ** 10 &&
    parameters.N <= 2 ** 20 &&
    Number.isInteger(parameters.r) &&
    parameters.r >= 1 &&
    parameters.r <= 32 &&
    Number.isInteger(parameters.p) &&
    parameters.p >= 1 &&
    parameters.p <= 16 &&
    Number.isInteger(parameters.keyLength) &&
    parameters.keyLength >= 32 &&
    parameters.keyLength <= 64 &&
    Number.isInteger(parameters.maxmem) &&
    parameters.maxmem > estimatedMemory &&
    parameters.maxmem <= 1024 * 1024 * 1024
  );
}

export function validatePassword(password: string): string | null {
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (Array.from(password).length < MIN_PASSWORD_BYTES) {
    return '비밀번호는 12자 이상이어야 합니다.';
  }
  if (byteLength > MAX_PASSWORD_BYTES) {
    return '비밀번호가 너무 깁니다.';
  }
  return null;
}

export async function hashPassword(
  password: string,
  parameters: ScryptParameters = DEFAULT_SCRYPT_PARAMETERS
): Promise<PasswordDigest> {
  if (!areSafeParameters(parameters)) {
    throw new Error('Unsafe scrypt parameters');
  }

  const salt = randomBytes(32);
  const hash = await deriveKey(password, salt, parameters);
  return {
    algorithm: 'scrypt',
    version: 1,
    salt: salt.toString('base64url'),
    hash: hash.toString('base64url'),
    parameters: { ...parameters },
  };
}

export async function verifyPassword(password: string, digest: PasswordDigest): Promise<boolean> {
  try {
    if (
      digest.algorithm !== 'scrypt' ||
      digest.version !== 1 ||
      !areSafeParameters(digest.parameters) ||
      Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
    ) {
      return false;
    }

    const salt = Buffer.from(digest.salt, 'base64url');
    const expected = Buffer.from(digest.hash, 'base64url');
    if (salt.length !== 32 || expected.length !== digest.parameters.keyLength) {
      return false;
    }

    const actual = await deriveKey(password, salt, digest.parameters);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
