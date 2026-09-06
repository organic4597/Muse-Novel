import { access } from 'node:fs/promises';
import path from 'node:path';

const WEB_PREFIX = '/uploads/';
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;

function safeSegments(webPath: string) {
  const pathname = webPath.split(/[?#]/, 1)[0]?.replaceAll('\\', '/');
  if (!pathname?.startsWith(WEB_PREFIX)) {
    throw new TypeError('업로드 경로는 /uploads/로 시작해야 합니다.');
  }

  const segments = pathname.slice(WEB_PREFIX.length).split('/').filter(Boolean);
  if (
    segments.length === 0 ||
    segments.length > 12 ||
    segments.some((segment) => !SAFE_SEGMENT.test(segment))
  ) {
    throw new TypeError('안전하지 않은 업로드 경로입니다.');
  }
  return segments;
}

export function getUploadsRoot() {
  const configured = process.env.UPLOADS_DIR?.trim();
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), 'data', 'uploads');
}

export function getLegacyUploadsRoot() {
  return path.resolve(process.cwd(), 'public', 'uploads');
}

function resolveWithin(root: string, segments: string[]) {
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new TypeError('업로드 루트 밖의 경로는 사용할 수 없습니다.');
  }
  return resolved;
}

export function getUploadWritePath(webPath: string) {
  return resolveWithin(getUploadsRoot(), safeSegments(webPath));
}

export function createUploadWebPath(...segments: string[]) {
  const webPath = `/uploads/${segments.join('/')}`;
  safeSegments(webPath);
  return webPath;
}

export async function findExistingUploadPath(webPath: string) {
  const segments = safeSegments(webPath);
  const primary = resolveWithin(getUploadsRoot(), segments);
  try {
    await access(primary);
    return primary;
  } catch {
    const legacy = resolveWithin(getLegacyUploadsRoot(), segments);
    await access(legacy);
    return legacy;
  }
}
