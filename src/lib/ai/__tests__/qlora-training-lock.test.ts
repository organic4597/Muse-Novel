import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('qlora-training-lock', () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-qlora-lock-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('acquires a lock when none exists', async () => {
    const { acquireTrainingLock, readTrainingLock } = await import('../qlora-training-lock');

    const result = acquireTrainingLock('project-a');

    expect(result.ok).toBe(true);
    expect(readTrainingLock()?.projectId).toBe('project-a');
  });

  it('rejects a second live lock', async () => {
    const { acquireTrainingLock } = await import('../qlora-training-lock');
    acquireTrainingLock('project-a');

    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const second = acquireTrainingLock('project-b');

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.lock?.projectId).toBe('project-a');
    }
  });
});