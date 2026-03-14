import fs from 'fs';
import path from 'path';

type QloraTrainingLock = {
  projectId: string;
  ownerPid: number;
  trainingPid: number | null;
  startedAt: string;
  updatedAt: string;
};

const LOCK_FILE = path.join(process.cwd(), 'loras', '.qlora-training.lock.json');

function ensureLockDir(): void {
  fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
}

function isProcessAlive(pid: number | null): boolean {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeLock(lock: QloraTrainingLock): void {
  ensureLockDir();
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2), 'utf-8');
}

export function readTrainingLock(): QloraTrainingLock | null {
  if (!fs.existsSync(LOCK_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8')) as QloraTrainingLock;
  } catch {
    return null;
  }
}

export function releaseTrainingLock(): void {
  try {
    fs.rmSync(LOCK_FILE, { force: true });
  } catch {
    // ignore
  }
}

export function acquireTrainingLock(projectId: string):
  | { ok: true; lock: QloraTrainingLock }
  | { ok: false; lock: QloraTrainingLock | null } {
  ensureLockDir();

  const existing = readTrainingLock();
  if (existing) {
    const alive = isProcessAlive(existing.trainingPid) || isProcessAlive(existing.ownerPid);
    if (alive) {
      return { ok: false, lock: existing };
    }
    releaseTrainingLock();
  }

  const now = new Date().toISOString();
  const lock: QloraTrainingLock = {
    projectId,
    ownerPid: process.pid,
    trainingPid: null,
    startedAt: now,
    updatedAt: now,
  };

  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeFileSync(fd, JSON.stringify(lock, null, 2), 'utf-8');
    fs.closeSync(fd);
    return { ok: true, lock };
  } catch {
    const current = readTrainingLock();
    if (current) {
      const alive = isProcessAlive(current.trainingPid) || isProcessAlive(current.ownerPid);
      if (!alive) {
        releaseTrainingLock();
        return acquireTrainingLock(projectId);
      }
    }
    return { ok: false, lock: current };
  }
}

export function updateTrainingLock(patch: Partial<QloraTrainingLock>): QloraTrainingLock | null {
  const current = readTrainingLock();
  if (!current) {
    return null;
  }

  const next: QloraTrainingLock = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeLock(next);
  return next;
}