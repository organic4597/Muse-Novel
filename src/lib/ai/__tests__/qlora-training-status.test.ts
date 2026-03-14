import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('qlora-training-status', () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-qlora-status-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('marks stale running status as error when pid is gone', async () => {
    const { writeTrainingStatus, readTrainingStatus } = await import('../qlora-training-status');

    writeTrainingStatus('project-1', {
      running: true,
      stage: 'training',
      progress: 20,
      message: '학습 중',
      error: null,
      logs: [],
      output: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finishedAt: null,
      trainingPid: 999999,
      cancelRequestedAt: null,
    });

    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('not found');
    });

    const status = readTrainingStatus('project-1');

    expect(status.running).toBe(false);
    expect(status.stage).toBe('error');
    expect(status.trainingPid).toBeNull();
  });

  it('returns cancelled when cancel was requested and pid is gone', async () => {
    const { writeTrainingStatus, readTrainingStatus } = await import('../qlora-training-status');

    writeTrainingStatus('project-2', {
      running: true,
      stage: 'training',
      progress: 55,
      message: '취소 대기 중',
      error: null,
      logs: [],
      output: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finishedAt: null,
      trainingPid: 999998,
      cancelRequestedAt: new Date().toISOString(),
    });

    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('not found');
    });

    const status = readTrainingStatus('project-2');

    expect(status.running).toBe(false);
    expect(status.stage).toBe('cancelled');
    expect(status.error).toBeNull();
  });
});