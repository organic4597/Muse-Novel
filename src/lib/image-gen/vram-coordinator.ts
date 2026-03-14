/**
 * VRAM Coordinator — manages GPU resource allocation across:
 * - llama-server (inference)
 * - diffusers image generation (subprocess)
 * - LoRA training
 *
 * Strategy:
 * - Image generation uses diffusers subprocess → VRAM freed on process exit
 * - Before image gen: stop llama-server to free VRAM
 * - After image gen: restart llama-server automatically
 * - If LoRA training active: reject image gen request
 */

import { readTrainingLock } from '../ai/qlora-training-lock';
import {
  stopServer,
  startServer,
  isServerRunning,
  freeGpuForTraining,
} from '../ai/qwen-server-manager';

export class VramCoordinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VramCoordinationError';
  }
}

/** Check if LoRA training is currently running (via lock file + PID check). */
async function isTrainingActive(): Promise<boolean> {
  const lock = readTrainingLock();
  if (!lock) return false;

  // Verify PID is still alive
  const pid = lock.trainingPid ?? lock.ownerPid;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire GPU resources for image generation.
 * - Checks that LoRA training is not active
 * - Stops llama-server to free VRAM
 * Returns a release function to restore the previous state.
 */
export async function acquireGpuForImageGen(): Promise<() => Promise<void>> {
  // 1. Check training lock
  if (await isTrainingActive()) {
    throw new VramCoordinationError(
      'LoRA 학습이 진행 중입니다. 학습이 완료된 후 이미지 생성을 다시 시도하세요.'
    );
  }

  // 2. Record if inference server was running (to restore later)
  const wasRunning = await isServerRunning();

  // 3. Stop inference server to free VRAM
  if (wasRunning) {
    console.log('[vram-coord] Stopping inference server for image generation...');
    await stopServer();
    // Brief wait for GPU memory to be released
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 4. Return release function
  return async () => {
    // Double-check training hasn't started while we were generating
    if (await isTrainingActive()) {
      console.log('[vram-coord] Training started during image gen, skipping inference restart');
      return;
    }

    if (wasRunning) {
      console.log('[vram-coord] Restarting inference server after image generation...');
      try {
        await startServer();
      } catch (err) {
        console.error('[vram-coord] Failed to restart inference server:', err);
      }
    }
  };
}

/**
 * Execute an image generation task with VRAM coordination.
 * Wraps the task in acquire/release GPU logic.
 */
export async function withGpuForImageGen<T>(
  task: () => Promise<T>
): Promise<T> {
  const release = await acquireGpuForImageGen();
  try {
    return await task();
  } finally {
    await release();
  }
}
