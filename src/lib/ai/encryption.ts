import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ALGORITHM = 'aes-256-gcm';
const LEGACY_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 12;
const LEGACY_IV_LENGTH = 16;
const LOCAL_KEY_PATH = path.join(process.cwd(), 'data', '.encryption-key');
const LEGACY_DEFAULT_KEY = 'muse-novel-dev-key-32chars!!';

function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY?.trim();
  if (envKey) {
    return createHash('sha256').update(envKey, 'utf8').digest();
  }

  if (process.env.DATABASE_PROVIDER === 'turso') {
    throw new Error('Turso에서 API 키를 저장하려면 ENCRYPTION_KEY가 필요합니다.');
  }

  try {
    const storedKey = Buffer.from(fs.readFileSync(LOCAL_KEY_PATH, 'utf8').trim(), 'base64');
    if (storedKey.length === 32) return storedKey;
  } catch {
    // Create a local key below.
  }

  fs.mkdirSync(path.dirname(LOCAL_KEY_PATH), { recursive: true });
  const generatedKey = randomBytes(32);

  try {
    fs.writeFileSync(LOCAL_KEY_PATH, generatedKey.toString('base64'), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    return generatedKey;
  } catch {
    const storedKey = Buffer.from(fs.readFileSync(LOCAL_KEY_PATH, 'utf8').trim(), 'base64');
    if (storedKey.length !== 32) {
      throw new Error('로컬 암호화 키 파일이 손상되었습니다.');
    }
    return storedKey;
  }
}

function getLegacyEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY || LEGACY_DEFAULT_KEY;
  const keyBuffer = Buffer.alloc(32);
  Buffer.from(envKey, 'utf-8').copy(keyBuffer);
  return keyBuffer;
}

/**
 * Encrypt an API key using authenticated AES-256-GCM.
 * Returns a versioned string in the format: v2:iv:authTag:encrypted
 */
export function encryptApiKey(plainKey: string): string {
  if (!plainKey) return '';

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainKey, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  return `v2:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an API key that was encrypted with encryptApiKey.
 * Expects a hex string in the format: iv:encrypted
 */
export function decryptApiKey(encryptedKey: string): string {
  if (!encryptedKey) return '';

  try {
    if (encryptedKey.startsWith('v2:')) {
      const [, ivHex, authTagHex, encrypted] = encryptedKey.split(':');
      if (!ivHex || !authTagHex || !encrypted) return '';

      const decipher = createDecipheriv(
        ALGORITHM,
        getEncryptionKey(),
        Buffer.from(ivHex, 'hex')
      );
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
      decrypted += decipher.final('utf-8');
      return decrypted;
    }

    // Backward compatibility for API keys saved by older Muse Novel versions.
    const [ivHex, encrypted] = encryptedKey.split(':');
    if (!ivHex || !encrypted) return '';

    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== LEGACY_IV_LENGTH) return '';
    const decipher = createDecipheriv(
      LEGACY_ALGORITHM,
      getLegacyEncryptionKey(),
      iv
    );

    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch {
    return '';
  }
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
