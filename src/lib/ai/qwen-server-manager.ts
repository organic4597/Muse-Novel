import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { getHuggingFaceToken, getQloraBaseModel, getQloraPythonPath } from './qlora-runtime';

const PID_FILE = path.join(process.cwd(), '.qwen-server.pid');
const LOG_FILE = path.join('/tmp', 'qwen-local.log');
let startPromise: Promise<{ ok: boolean; message: string }> | null = null;
let stopPromise: Promise<void> | null = null;
/** Tracks the LoRA adapter currently loaded on the running server. */
let currentLoraPath: string | undefined;

type StartServerOptions = {
  loraPath?: string;
  modelId?: string;
  baseUrl?: string;
};

function getServerUrl(baseUrl?: string): string {
  return baseUrl || process.env.QWEN_LOCAL_URL || 'http://localhost:8321';
}

function getServerPort(baseUrl?: string): number {
  const url = getServerUrl(baseUrl);
  try {
    return new URL(url).port ? Number(new URL(url).port) : 8321;
  } catch {
    return 8321;
  }
}

function getPythonPath(): string {
  return getQloraPythonPath();
}

function getBaseModel(): string {
  return getQloraBaseModel();
}

/** Resolve the GGUF model path for llama-server. */
function getGgufModelPath(): string {
  const explicit = process.env.QWEN_GGUF_MODEL_PATH?.trim();
  if (explicit) return explicit;
  return '/root/models/Qwen3.5-9B-Base-Q4_K_M.gguf';
}

/** Resolve the llama-server binary path. */
function getLlamaServerPath(): string {
  const explicit = process.env.LLAMA_SERVER_PATH?.trim();
  if (explicit) return explicit;
  return '/usr/local/bin/llama-server';
}

function getInferenceGpuEnv(): Record<string, string> {
  // UUID pinning is the most reliable — ensures llama-server loads the model
  // onto the correct physical GPU even when device indices are remapped.
  const gpuUuid = process.env.QWEN_INFERENCE_GPU_UUID?.trim();
  if (gpuUuid) {
    return {
      CUDA_VISIBLE_DEVICES: gpuUuid,
    };
  }

  const targetGpu = process.env.QWEN_INFERENCE_GPU?.trim();
  if (targetGpu) {
    return {
      CUDA_VISIBLE_DEVICES: targetGpu,
    };
  }

  return {};
}

function readPid(): number | null {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf-8').trim());
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function writePid(pid: number): void {
  fs.writeFileSync(PID_FILE, String(pid), 'utf-8');
}

function clearPid(): void {
  try {
    fs.rmSync(PID_FILE, { force: true });
  } catch {
    // ignore
  }
}

function findExistingServerPid(): number | null {
  const trackedPid = readPid();
  if (trackedPid && isProcessAlive(trackedPid)) {
    return trackedPid;
  }

  try {
    const raw = execSync("pgrep -f 'llama-server.*--port' | head -n 1", {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const pid = Number(raw);
    if (Number.isFinite(pid) && pid > 0 && isProcessAlive(pid)) {
      writePid(pid);
      return pid;
    }
  } catch {
    // ignore
  }

  return null;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessTree(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
    return;
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // ignore
    }
  }
}

async function waitForServerReady(
  pid: number | null,
  baseUrl?: string,
  timeoutMs = 60_000
): Promise<{ ok: boolean; message: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await isServerRunning(baseUrl)) {
      return { ok: true, message: '추론 서버 시작 완료' };
    }
    if (pid && !isProcessAlive(pid)) {
      clearPid();
      return { ok: false, message: '추론 서버가 시작 중 종료됨' };
    }
  }

  return { ok: false, message: '추론 서버 시작 시간 초과 (1분)' };
}

/** Check if the inference server is responding. */
export async function isServerRunning(baseUrl?: string): Promise<boolean> {
  try {
    const res = await fetch(`${getServerUrl(baseUrl)}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getServerModelId(
  baseUrl?: string
): Promise<string | null> {
  try {
    const res = await fetch(`${getServerUrl(baseUrl)}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      data?: Array<{ id?: string }>;
    };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Get current LoRA status (tracked in-process since llama-server has no status endpoint). */
export async function getLoraStatus(): Promise<{
  loaded: boolean;
  adapter_path: string | null;
} | null> {
  if (!(await isServerRunning())) return null;
  return {
    loaded: !!currentLoraPath,
    adapter_path: currentLoraPath ?? null,
  };
}

/**
 * Start the llama-server inference engine in the background.
 * Optionally load a LoRA adapter (GGUF format).
 * Returns once the server responds to /health (or times out).
 */
export async function startServer(
  options: StartServerOptions = {}
): Promise<{ ok: boolean; message: string }> {
  const { loraPath, modelId, baseUrl } = options;

  if (startPromise) {
    return startPromise;
  }

  if (await isServerRunning(baseUrl)) {
    const runningPid = findExistingServerPid();
    if (runningPid) {
      writePid(runningPid);
    }
    // If LoRA changed, restart the server with the new adapter
    if (loraPath && currentLoraPath !== loraPath) {
      console.log('[qwen-manager] LoRA changed, restarting server...');
      await stopServer(baseUrl);
    } else if (!loraPath && currentLoraPath) {
      console.log('[qwen-manager] LoRA removed, restarting server...');
      await stopServer(baseUrl);
    } else {
      return { ok: true, message: '서버 이미 실행 중' };
    }
  }

  const existingPid = findExistingServerPid();
  if (existingPid && !loraPath && !currentLoraPath) {
    startPromise = waitForServerReady(existingPid, baseUrl).finally(() => {
      startPromise = null;
    });
    return startPromise;
  }

  startPromise = (async () => {
    try {
      execSync("pkill -f 'llama-server.*--port' 2>/dev/null || true", {
        stdio: 'ignore',
      });
    } catch {
      // ignore
    }

    const llamaServer = getLlamaServerPath();
    const port = getServerPort(baseUrl);
    const ggufModel = getGgufModelPath();
    const logFd = fs.openSync(LOG_FILE, 'a');

    const args = [
      '--model', ggufModel,
      '--port', String(port),
      '--host', '0.0.0.0',
      '--ctx-size', '8192',
      '--n-gpu-layers', '99',
      '--flash-attn', 'on',
      '--split-mode', 'none',
    ];

    if (loraPath) {
      args.push('--lora', loraPath);
    }

    const gpuEnv = getInferenceGpuEnv();

    const child = spawn(llamaServer, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        ...gpuEnv,
      },
    });

    child.unref();
    currentLoraPath = loraPath;

    if (child.pid) {
      writePid(child.pid);
      console.log(`[qwen-manager] llama-server started (PID ${child.pid})`);
    }

    return waitForServerReady(child.pid ?? null, baseUrl);
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

/**
 * Gracefully stop the inference server to free GPU VRAM.
 * Returns once the process is confirmed dead.
 */
export async function stopServer(baseUrl?: string): Promise<void> {
  if (stopPromise) {
    return stopPromise;
  }

  stopPromise = (async () => {
    const pid = findExistingServerPid();
    if (pid && isProcessAlive(pid)) {
      killProcessTree(pid, 'SIGTERM');
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && isProcessAlive(pid)) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (isProcessAlive(pid)) {
        killProcessTree(pid, 'SIGKILL');
      }
      clearPid();
      console.log(`[qwen-manager] Server stopped (PID ${pid})`);
    }

    try {
      execSync("pkill -f 'llama-server.*--port' 2>/dev/null || true", {
        stdio: 'ignore',
      });
      const port = getServerPort(baseUrl);
      execSync(`lsof -ti :${port} | xargs -r kill -9 2>/dev/null`, {
        stdio: 'ignore',
      });
    } catch {
      // no process on port
    }
    clearPid();
    currentLoraPath = undefined;
    console.log('[qwen-manager] Server stopped (by port)');
    await new Promise((r) => setTimeout(r, 1000));
  })().finally(() => {
    stopPromise = null;
  });

  return stopPromise;
}

/** Load a LoRA adapter by restarting llama-server with --lora flag. */
export async function loadLoraOnServer(
  adapterDir: string,
  baseUrl?: string
): Promise<{ ok: boolean }> {
  // llama-server requires restart to change LoRA
  if (currentLoraPath === adapterDir && await isServerRunning(baseUrl)) {
    return { ok: true };
  }
  await stopServer(baseUrl);
  const result = await startServer({ loraPath: adapterDir, baseUrl });
  return { ok: result.ok };
}

/**
 * Ensure the server is stopped and GPU is free for training.
 * Also evicts ollama models.
 */
export async function freeGpuForTraining(): Promise<void> {
  const pid = findExistingServerPid();
  if (pid || (await isServerRunning())) {
    console.log('[qwen-manager] Stopping inference server for training...');
    await stopServer();
  }

  // Also kill any orphan llama-server processes that slipped through
  try {
    execSync("pkill -9 -f 'llama-server' 2>/dev/null || true", { stdio: 'ignore' });
  } catch { /* ignore */ }

  // Wait for GPU VRAM to actually be released by the driver (all GPUs)
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const smi = execSync(
        'nvidia-smi --query-gpu=index,memory.used --format=csv,noheader,nounits',
        { encoding: 'utf-8', timeout: 3000 }
      ).trim();
      const lines = smi.split('\n').map(l => l.trim()).filter(Boolean);
      let allFree = true;
      for (const line of lines) {
        const [idx, used] = line.split(',').map(s => s.trim());
        const usedMiB = parseInt(used, 10);
        if (!isNaN(usedMiB) && usedMiB >= 500) {
          console.log(`[qwen-manager] GPU ${idx}: ${usedMiB} MiB still used, waiting...`);
          allFree = false;
        }
      }
      if (allFree) {
        console.log(`[qwen-manager] All GPUs VRAM freed`);
        break;
      }
    } catch { /* nvidia-smi not available */ break; }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Evict ollama models
  const ollamaBase = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  try {
    const psRes = await fetch(`${ollamaBase}/api/ps`, {
      signal: AbortSignal.timeout(3000),
    });
    if (psRes.ok) {
      const ps = (await psRes.json()) as { models?: { name: string }[] };
      if (ps.models?.length) {
        await Promise.all(
          ps.models.map((m) =>
            fetch(`${ollamaBase}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: m.name, keep_alive: 0 }),
            }).catch(() => {})
          )
        );
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } catch {
    /* ollama not running */
  }
}

/**
 * Convert a PEFT LoRA adapter to GGUF format for llama-server.
 * Returns the path to the .gguf adapter file, or null on failure.
 */
function convertLoraToGguf(peftDir: string): string | null {
  const ggufOut = path.join(peftDir, 'adapter.gguf');
  if (fs.existsSync(ggufOut)) {
    console.log(`[qwen-manager] GGUF adapter already exists: ${ggufOut}`);
    return ggufOut;
  }

  const converterScript = '/opt/llama.cpp/convert_lora_to_gguf.py';
  if (!fs.existsSync(converterScript)) {
    console.warn('[qwen-manager] convert_lora_to_gguf.py not found, skipping LoRA conversion');
    return null;
  }

  try {
    const pythonPath = getPythonPath();
    console.log(`[qwen-manager] Converting PEFT LoRA to GGUF: ${peftDir}`);
    execSync(
      `${pythonPath} ${converterScript} --outfile "${ggufOut}" "${peftDir}"`,
      { stdio: 'pipe', timeout: 120_000 }
    );
    if (fs.existsSync(ggufOut)) {
      console.log(`[qwen-manager] LoRA GGUF created: ${ggufOut}`);
      return ggufOut;
    }
  } catch (e) {
    console.warn('[qwen-manager] LoRA GGUF conversion failed:', e);
  }
  return null;
}

/**
 * After training completes, convert LoRA to GGUF and restart the server.
 * Non-blocking — fires and forgets (server starts in background).
 */
export function restartServerAfterTraining(loraDir?: string): void {
  let ggufAdapter: string | undefined;
  if (loraDir) {
    const converted = convertLoraToGguf(loraDir);
    ggufAdapter = converted ?? undefined;
  }

  startServer({ loraPath: ggufAdapter }).then((result) => {
    console.log(`[qwen-manager] Post-training restart: ${result.message}`);
  }).catch((e) => {
    console.warn('[qwen-manager] Post-training restart failed:', e);
  });
}

/**
 * Ensure the inference server is ready for a request.
 * If not running, starts it (with optional LoRA).
 * Returns false if server couldn't be started (e.g. training in progress).
 */
export async function ensureServerForInference(
  options: StartServerOptions = {}
): Promise<{ ok: boolean; message: string }> {
  const { modelId, baseUrl } = options;
  let { loraPath } = options;

  // Convert PEFT adapter to GGUF if needed
  if (loraPath && !loraPath.endsWith('.gguf')) {
    const converted = convertLoraToGguf(loraPath);
    loraPath = converted ?? undefined;
  }

  if (await isServerRunning(baseUrl)) {
    // If LoRA changed, restart
    if (loraPath && currentLoraPath !== loraPath) {
      console.log('[qwen-manager] LoRA mismatch, restarting...');
      await stopServer(baseUrl);
      return startServer({ loraPath, modelId, baseUrl });
    }
    if (!loraPath && currentLoraPath) {
      console.log('[qwen-manager] LoRA no longer needed, restarting...');
      await stopServer(baseUrl);
      return startServer({ baseUrl });
    }
    return { ok: true, message: '추론 서버 준비 완료' };
  }

  // Server not running — start it
  console.log('[qwen-manager] Inference server not running, starting...');
  return startServer({ loraPath, modelId, baseUrl });
}
