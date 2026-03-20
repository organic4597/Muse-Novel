/**
 * DiffusersProcessManager — singleton that manages a persistent
 * `image_generator_daemon.py` subprocess.
 *
 * The daemon loads the diffusers model once and accepts generation
 * jobs as JSON lines on stdin, returning results on stdout.
 * Progress events are emitted on stderr as `[PROGRESS]{...}` lines.
 *
 * Falls back gracefully if the daemon crashes — the caller can then
 * use the one-shot `runPythonScript()` path.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';

import type { ImageGenerationTimings } from './types';

// ---------------------------------------------------------------------------
// Types (local — avoids circular import with diffusers-client.ts)
// ---------------------------------------------------------------------------

type ProgressMetadata = {
  stage?: string;
  durationMs?: number;
  timings?: ImageGenerationTimings;
  gpu?: string;
};

export type DaemonProgressEvent =
  | ({ type: 'status'; status: string; message: string } & ProgressMetadata)
  | ({
      type: 'progress';
      step: number;
      totalSteps: number;
      progress: number;
      elapsed: number;
    } & ProgressMetadata);

export interface DaemonJobRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  batchSize: number;
  seed?: number;
  outputDir: string;
  modelId?: string;
  gpu?: string;
  scheduler?: string;
  loraPath?: string;
  loraWeight?: number;
}

export interface DaemonScriptResult {
  success: boolean;
  images?: Array<{
    filename: string;
    seed: number;
    width: number;
    height: number;
  }>;
  prompt?: string;
  negativePrompt?: string;
  modelId?: string;
  loadTime?: number;
  genTime?: number;
  timings?: ImageGenerationTimings;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal pending-job bookkeeping
// ---------------------------------------------------------------------------

interface PendingJob {
  resolve: (result: DaemonScriptResult) => void;
  reject: (error: Error) => void;
  onProgress?: (event: DaemonProgressEvent) => void;
}

// ---------------------------------------------------------------------------
// DiffusersProcessManager
// ---------------------------------------------------------------------------

const DAEMON_SCRIPT = path.join(process.cwd(), 'scripts', 'image_generator_daemon.py');

function getPythonPath(): string {
  return process.env.IMAGE_GEN_PYTHON_PATH?.trim() || 'python3';
}

export class DiffusersProcessManager {
  private static instance: DiffusersProcessManager | null = null;

  private process: ChildProcess | null = null;
  private gpu: string | null = null;
  private modelId: string | null = null;
  private ready = false;
  private starting = false;

  /** FIFO queue — daemon processes jobs sequentially. */
  private pendingJobs: PendingJob[] = [];

  /** readline interface on stdout for line-by-line result parsing. */
  private stdoutRL: ReadlineInterface | null = null;

  /** Active progress callback (for the job currently being processed). */
  private activeProgressCb: ((event: DaemonProgressEvent) => void) | undefined;

  // Singleton ---------------------------------------------------------------

  static getInstance(): DiffusersProcessManager {
    if (!DiffusersProcessManager.instance) {
      DiffusersProcessManager.instance = new DiffusersProcessManager();
    }
    return DiffusersProcessManager.instance;
  }

  private constructor() {}

  // Public API ---------------------------------------------------------------

  /**
   * Start the daemon subprocess.
   * If already running with the same gpu+model combination, this is a no-op.
   * If running with a *different* model, the old process is killed first.
   */
  async startDaemon(gpu: string, modelId: string): Promise<void> {
    // Already running with correct config
    if (this.process && this.ready && this.gpu === gpu && this.modelId === modelId) {
      return;
    }

    // Running with different config — tear down first
    if (this.process) {
      await this.stopDaemon();
    }

    if (this.starting) {
      // Another startDaemon call is in progress — wait for it
      await this.waitForReady();
      return;
    }

    this.starting = true;
    this.gpu = gpu;
    this.modelId = modelId;

    const pythonPath = getPythonPath();

    this.process = spawn(
      pythonPath,
      [DAEMON_SCRIPT, '--gpu', gpu, '--model', modelId],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      },
    );

    // --- stdout: one JSON result line per completed job ---
    this.stdoutRL = createInterface({ input: this.process.stdout! });
    this.stdoutRL.on('line', (line: string) => {
      this.handleStdoutLine(line);
    });

    // --- stderr: progress events + log lines ---
    const stderrRL = createInterface({ input: this.process.stderr! });
    stderrRL.on('line', (line: string) => {
      this.handleStderrLine(line);
    });

    // --- process lifecycle ---
    this.process.on('close', (_code) => {
      this.handleProcessExit();
    });

    this.process.on('error', (err) => {
      console.error('[diffusers-daemon] Process error:', err.message);
      this.handleProcessExit();
    });

    // Wait for the "ready" status from the daemon
    await this.waitForReady();
  }

  /**
   * Submit a generation job to the daemon.
   *
   * The daemon must already be started (call `startDaemon()` first).
   * If the daemon is not healthy, this rejects immediately so the
   * caller can fall back to one-shot mode.
   */
  submitJob(
    request: DaemonJobRequest,
    onProgress?: (event: DaemonProgressEvent) => void,
  ): Promise<DaemonScriptResult> {
    if (!this.ready || !this.process || !this.process.stdin) {
      return Promise.reject(new Error('Daemon is not ready'));
    }

    return new Promise<DaemonScriptResult>((resolve, reject) => {
      this.pendingJobs.push({ resolve, reject, onProgress });

      // If this is the only job in the queue, it's the active one
      if (this.pendingJobs.length === 1) {
        this.activeProgressCb = onProgress;
      }

      const jobLine = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(jobLine, (err) => {
        if (err) {
          // Remove the job we just pushed
          const idx = this.pendingJobs.findIndex((j) => j.resolve === resolve);
          if (idx !== -1) this.pendingJobs.splice(idx, 1);
          reject(new Error(`Failed to write to daemon stdin: ${err.message}`));
        }
      });
    });
  }

  /** Returns `true` if the daemon process is alive and has finished loading. */
  isHealthy(): boolean {
    return this.ready && this.process !== null && this.process.exitCode === null;
  }

  /** Gracefully stop the daemon (sends EOF on stdin). */
  async stopDaemon(): Promise<void> {
    if (!this.process) return;

    this.ready = false;

    // Close stdin → daemon sees EOF → exits cleanly
    try {
      this.process.stdin?.end();
    } catch {
      // already closed
    }

    // Give the process a moment to exit, then force-kill
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          this.process?.kill('SIGTERM');
        } catch {
          // already dead
        }
        resolve();
      }, 3000);

      this.process!.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    this.cleanup();
  }

  // Internal helpers ---------------------------------------------------------

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let result: DaemonScriptResult;
    try {
      result = JSON.parse(trimmed) as DaemonScriptResult;
    } catch {
      console.error('[diffusers-daemon] Failed to parse stdout JSON:', trimmed.slice(0, 200));
      return;
    }

    const job = this.pendingJobs.shift();
    if (job) {
      job.resolve(result);
    }

    // Advance active progress callback to the next pending job
    this.activeProgressCb = this.pendingJobs[0]?.onProgress;
  }

  private handleStderrLine(line: string): void {
    const progressMatch = line.match(/\[PROGRESS\](.+)/);
    if (progressMatch) {
      try {
        const event = JSON.parse(progressMatch[1]) as DaemonProgressEvent;

        // Check for "ready" signal
        if (event.type === 'status' && event.status === 'ready') {
          this.ready = true;
          this.starting = false;
          return;
        }

        // Forward progress to the active job's callback
        this.activeProgressCb?.(event);
      } catch {
        // ignore parse errors
      }
    } else if (line.includes('[image-gen-daemon]')) {
      console.log(line.trimEnd());
    }
  }

  private handleProcessExit(): void {
    console.log('[diffusers-daemon] Process exited');
    this.ready = false;
    this.starting = false;

    // Reject all pending jobs
    for (const job of this.pendingJobs) {
      job.reject(new Error('Daemon process exited unexpectedly'));
    }
    this.pendingJobs = [];
    this.activeProgressCb = undefined;

    this.cleanup();
  }

  private cleanup(): void {
    this.stdoutRL?.close();
    this.stdoutRL = null;
    this.process = null;
  }

  /**
   * Wait until the daemon emits `ready` status or the process dies.
   * Resolves when ready; rejects on timeout or process death.
   */
  private waitForReady(): Promise<void> {
    if (this.ready) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      // 120s timeout — model loading can be slow on first run
      const timeout = setTimeout(() => {
        reject(new Error('Daemon startup timed out (120s)'));
      }, 120_000);

      const check = setInterval(() => {
        if (this.ready) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        } else if (!this.process || this.process.exitCode !== null) {
          clearTimeout(timeout);
          clearInterval(check);
          reject(new Error('Daemon process died during startup'));
        }
      }, 100);
    });
  }
}

// ---------------------------------------------------------------------------
// Module-level accessor
// ---------------------------------------------------------------------------

/** Get the singleton DiffusersProcessManager instance. */
export function getDiffusersManager(): DiffusersProcessManager {
  return DiffusersProcessManager.getInstance();
}
