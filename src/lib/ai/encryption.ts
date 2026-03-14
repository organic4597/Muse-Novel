import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY || 'muse-novel-dev-key-32chars!!';
  // Ensure key is exactly 32 bytes for AES-256
  const keyBuffer = Buffer.alloc(32);
  Buffer.from(envKey, 'utf-8').copy(keyBuffer);
  return keyBuffer;
}

/**
 * Encrypt an API key using AES-256-CBC.
 * Returns a hex string in the format: iv:encrypted
 */
export function encryptApiKey(plainKey: string): string {
  if (!plainKey) return '';

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainKey, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an API key that was encrypted with encryptApiKey.
 * Expects a hex string in the format: iv:encrypted
 */
export function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) return '';

  const key = getEncryptionKey();
  const [ivHex, encrypted] = encryptedKey.split(':');

  if (!ivHex || !encrypted) return '';

  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

/**
 * Mask an API key for display.
 * Shows first 5 chars + **** + last 3 chars.
 * For short keys (≤8 chars), shows first 2 + **** + last 1.
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 3) return '****';
  if (key.length <= 8) return `${key.slice(0, 2)}****${key.slice(-1)}`;
  return `${key.slice(0, 5)}****${key.slice(-3)}`;
}
