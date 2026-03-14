import fs from 'fs';
import path from 'path';

export type QloraTrainingStage =
  | 'idle'
  | 'loading'
  | 'tokenizing'
  | 'training'
  | 'saving'
  | 'done'
  | 'cancelled'
  | 'error';

export type QloraTrainingStatus = {
  running: boolean;
  stage: QloraTrainingStage;
  progress: number;
  message: string;
  error: string | null;
  logs: string[];
  output: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  trainingPid: number | null;
  cancelRequestedAt: string | null;
};

const MAX_LOG_LINES = 200;

function getStatusFilePath(projectId: string): string {
  return path.join(process.cwd(), 'loras', projectId, '.training-status.json');
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function normalizeTrainingStatus(status: QloraTrainingStatus): QloraTrainingStatus {
  if (!status.running) {
    return status;
  }

  if (status.trainingPid && isProcessAlive(status.trainingPid)) {
    return status;
  }

  const finishedAt = status.finishedAt ?? new Date().toISOString();
  if (status.cancelRequestedAt) {
    return {
      ...status,
      running: false,
      stage: 'cancelled',
      message: status.message || '학습이 취소되었습니다.',
      error: null,
      finishedAt,
      updatedAt: finishedAt,
      trainingPid: null,
    };
  }

  return {
    ...status,
    running: false,
    stage: 'error',
    message: '이전 학습 프로세스가 비정상 종료되었습니다.',
    error: status.error ?? '학습 프로세스를 찾을 수 없습니다.',
    finishedAt,
    updatedAt: finishedAt,
    trainingPid: null,
  };
}

export function getDefaultTrainingStatus(): QloraTrainingStatus {
  return {
    running: false,
    stage: 'idle',
    progress: 0,
    message: '',
    error: null,
    logs: [],
    output: null,
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
    trainingPid: null,
    cancelRequestedAt: null,
  };
}

export function readTrainingStatus(projectId: string): QloraTrainingStatus {
  const filePath = getStatusFilePath(projectId);
  if (!fs.existsSync(filePath)) {
    return getDefaultTrainingStatus();
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = {
      ...getDefaultTrainingStatus(),
      ...(JSON.parse(raw) as Partial<QloraTrainingStatus>),
    };
    const normalized = normalizeTrainingStatus(parsed);
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      writeTrainingStatus(projectId, normalized);
    }
    return normalized;
  } catch {
    return getDefaultTrainingStatus();
  }
}

export function writeTrainingStatus(
  projectId: string,
  status: QloraTrainingStatus
): void {
  const filePath = getStatusFilePath(projectId);
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(status, null, 2), 'utf-8');
}

export function startTrainingStatus(
  projectId: string,
  message: string,
  trainingPid?: number
): void {
  const now = new Date().toISOString();
  writeTrainingStatus(projectId, {
    running: true,
    stage: 'loading',
    progress: 0,
    message,
    error: null,
    logs: [],
    output: null,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    trainingPid: trainingPid ?? null,
    cancelRequestedAt: null,
  });
}

export function updateTrainingStatus(
  projectId: string,
  patch: Partial<QloraTrainingStatus>
): void {
  const current = readTrainingStatus(projectId);
  const next: QloraTrainingStatus = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeTrainingStatus(projectId, next);
}

export function appendTrainingLog(projectId: string, line: string): void {
  const current = readTrainingStatus(projectId);
  const logs = [...current.logs, line].slice(-MAX_LOG_LINES);
  writeTrainingStatus(projectId, {
    ...current,
    logs,
    updatedAt: new Date().toISOString(),
  });
}

export function requestTrainingCancel(projectId: string, message?: string): QloraTrainingStatus {
  const current = readTrainingStatus(projectId);
  const now = new Date().toISOString();
  const next: QloraTrainingStatus = {
    ...current,
    running: false,
    stage: 'cancelled',
    message: message ?? current.message ?? '학습이 취소되었습니다.',
    error: null,
    finishedAt: now,
    updatedAt: now,
    cancelRequestedAt: now,
    trainingPid: null,
  };
  writeTrainingStatus(projectId, next);
  return next;
}