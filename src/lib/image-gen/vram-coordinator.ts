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
 *
 * Optimization (A+B):
 * - A (ref count): Multiple concurrent acquires share a single Qwen stop/start cycle.
 *   If GPU is already held (refCount > 0) or debounce pending, skip Qwen stop.
 * - B (debounce release): After the last release, wait 30s before restarting Qwen.
 *   If a new acquire arrives during debounce, cancel the timer — Qwen stays off.
 */

import { readTrainingLock } from '../ai/qlora-training-lock';
import {
  freeGpuForTraining,
  isServerRunning,
  startServer,
  stopServer,
} from '../ai/qwen-server-manager';

export class VramCoordinationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VramCoordinationError';
  }
}

// ── Module-level state for ref-count + debounce ────────────────────────

/** Number of active GPU holders. Qwen is stopped while > 0. */
let gpuRefCount = 0;

/** Debounce timer for delayed Qwen restart after last release. */
let releaseDebounceTimer: NodeJS.Timeout | null = null;

/** Whether Qwen was running before the first acquire (refCount 0→1). */
let wasRunningBeforeFirstAcquire = false;

/** Debounce delay before restarting Qwen after the last release (ms). */
const RELEASE_DEBOUNCE_MS = 30_000;

// ── Helpers ────────────────────────────────────────────────────────────

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
 * Cancel the pending debounce restart timer, if any.
 * Called when a new acquire arrives during the debounce window.
 */
function cancelReleaseDebounce(): void {
  if (releaseDebounceTimer !== null) {
    clearTimeout(releaseDebounceTimer);
    releaseDebounceTimer = null;
    console.log('[vram-coord] Debounce timer cancelled (new acquire)');
  }
}

/**
 * Acquire GPU resources for image generation.
 * - Checks that LoRA training is not active
 * - Stops llama-server to free VRAM (only on first acquire)
 * - Subsequent acquires while GPU is held or debounce pending skip Qwen stop
 * Returns a release function to restore the previous state.
 */
export async function acquireGpuForImageGen(): Promise<() => Promise<void>> {
  // 1. Check training lock
  if (await isTrainingActive()) {
    throw new VramCoordinationError(
      'LoRA 학습이 진행 중입니다. 학습이 완료된 후 이미지 생성을 다시 시도하세요.'
    );
  }

  // 2. If debounce timer is pending, Qwen is already stopped — just cancel timer
  if (releaseDebounceTimer !== null) {
    cancelReleaseDebounce();
    gpuRefCount++;
    console.log(`[vram-coord] Acquire during debounce (refCount=${gpuRefCount})`);
    return createReleaseFunction();
  }

  // 3. If GPU already held by another acquire, skip Qwen stop
  if (gpuRefCount > 0) {
    gpuRefCount++;
    console.log(`[vram-coord] Acquire reuse (refCount=${gpuRefCount})`);
    return createReleaseFunction();
  }

  // 4. First acquire (refCount 0→1): record Qwen state and stop it
  wasRunningBeforeFirstAcquire = await isServerRunning();

  if (wasRunningBeforeFirstAcquire) {
    console.log('[vram-coord] Stopping inference server for image generation...');
    await stopServer();
    // Brief wait for GPU memory to be released
    await new Promise((r) => setTimeout(r, 2000));
  }

  gpuRefCount = 1;
  console.log(`[vram-coord] Acquire first (refCount=${gpuRefCount})`);
  return createReleaseFunction();
}

/**
 * Create a release function that decrements refCount and schedules
 * debounced Qwen restart when refCount reaches 0.
 */
function createReleaseFunction(): () => Promise<void> {
  let released = false;

  return async () => {
    // Guard against double-release from the same holder
    if (released) return;
    released = true;

    gpuRefCount = Math.max(0, gpuRefCount - 1);
    console.log(`[vram-coord] Release (refCount=${gpuRefCount})`);

    if (gpuRefCount > 0) {
      // Other holders still active — do nothing
      return;
    }

    // refCount reached 0 → schedule debounced Qwen restart
    if (!wasRunningBeforeFirstAcquire) {
      // Qwen wasn't running before, no need to restart
      return;
    }

    console.log(`[vram-coord] Scheduling Qwen restart in ${RELEASE_DEBOUNCE_MS / 1000}s...`);
    releaseDebounceTimer = setTimeout(() => {
      releaseDebounceTimer = null;

      // Fire-and-forget async restart
      void (async () => {
        // Skip restart if training started during debounce
        if (await isTrainingActive()) {
          console.log('[vram-coord] Training active, skipping inference restart');
          return;
        }

        console.log('[vram-coord] Debounce expired, restarting inference server...');
        try {
          await startServer();
        } catch (err) {
          console.error('[vram-coord] Failed to restart inference server:', err);
        }
      })();
    }, RELEASE_DEBOUNCE_MS);
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
