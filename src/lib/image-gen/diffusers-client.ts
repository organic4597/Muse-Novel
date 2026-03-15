import { spawn } from 'child_process';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';

import { getImageGenGpus } from '../gpu-config';
import {
  DEFAULT_DIFFUSERS_MODEL,
  type ImageGenerationResult,
} from './types';

const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'image_generator.py');

export interface DiffusersGenerateRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  batchSize: number;
  seed?: number;
  modelId?: string;
  gpu?: string;
  /** Multiple GPUs for parallel batch splitting. Takes priority over `gpu`. */
  gpus?: string[];
  scheduler?: string;
  outputDir: string;
  /** Absolute path to a LoRA .safetensors file */
  loraPath?: string;
  /** LoRA adapter weight (0.0-2.0, default 1.0) */
  loraWeight?: number;
}

export type ProgressEvent =
  | { type: 'status'; status: string; message: string }
  | { type: 'progress'; step: number; totalSteps: number; progress: number; elapsed: number };

interface ScriptResult {
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
  error?: string;
}

function getPythonPath(): string {
  return process.env.IMAGE_GEN_PYTHON_PATH?.trim() || 'python3';
}

function getDefaultGpu(): string {
  return getImageGenGpus()[0] ?? '0';
}

/**
 * Generate images using HuggingFace diffusers via subprocess(es).
 * When `gpus` array is provided and batchSize > 1, splits the batch across
 * multiple GPU processes for parallel generation (~2x speed with 2 GPUs).
 */
export async function generateWithDiffusers(
  request: DiffusersGenerateRequest,
  onProgress?: (event: ProgressEvent) => void,
): Promise<ImageGenerationResult> {
  const gpus = request.gpus?.length ? request.gpus : [request.gpu || getDefaultGpu()];

  // Single GPU (or batchSize=1): run one process
  if (gpus.length <= 1 || request.batchSize <= 1) {
    return runSingleGpu(request, gpus[0], onProgress);
  }

  // Multi-GPU: split batch across GPUs and run in parallel
  return runMultiGpu(request, gpus, onProgress);
}

async function runSingleGpu(
  request: DiffusersGenerateRequest,
  gpu: string,
  onProgress?: (event: ProgressEvent) => void,
): Promise<ImageGenerationResult> {
  await mkdir(request.outputDir, { recursive: true });
  const configPath = path.join(request.outputDir, `.gen-config-${Date.now()}.json`);

  const config = {
    prompt: request.prompt,
    negativePrompt: request.negativePrompt ?? '',
    width: request.width,
    height: request.height,
    steps: request.steps,
    cfgScale: request.cfgScale,
    batchSize: request.batchSize,
    seed: request.seed ?? -1,
    outputDir: request.outputDir,
    modelId: request.modelId || DEFAULT_DIFFUSERS_MODEL,
    gpu,
    scheduler: request.scheduler || 'euler_a',
    ...(request.loraPath ? { loraPath: request.loraPath } : {}),
    ...(request.loraWeight != null ? { loraWeight: request.loraWeight } : {}),
  };

  await writeFile(configPath, JSON.stringify(config), 'utf-8');

  try {
    const result = await runPythonScript(configPath, onProgress);

    if (!result.success) {
      throw new Error(result.error || '이미지 생성 스크립트가 실패했습니다');
    }

    return {
      images: (result.images ?? []).map((img) => ({
        base64: '',
        seed: img.seed,
        width: img.width,
        height: img.height,
        filePath: img.filename,
      })),
      prompt: result.prompt || request.prompt,
      negativePrompt: result.negativePrompt || request.negativePrompt || '',
    };
  } finally {
    await unlink(configPath).catch(() => {});
  }
}

/**
 * Split the batch across multiple GPUs and run processes in parallel.
 * Progress is aggregated: per-GPU progress is weighted and combined.
 */
async function runMultiGpu(
  request: DiffusersGenerateRequest,
  gpus: string[],
  onProgress?: (event: ProgressEvent) => void,
): Promise<ImageGenerationResult> {
  await mkdir(request.outputDir, { recursive: true });
  const totalBatch = request.batchSize;

  // Distribute batch across GPUs (e.g. 4 images / 2 GPUs → [2, 2])
  const splits: Array<{ gpu: string; batchSize: number; seedOffset: number }> = [];
  const basePerGpu = Math.floor(totalBatch / gpus.length);
  let remainder = totalBatch % gpus.length;
  let offset = 0;

  for (const gpu of gpus) {
    const count = basePerGpu + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    if (count > 0) {
      splits.push({ gpu, batchSize: count, seedOffset: offset });
      offset += count;
    }
  }

  if (onProgress) {
    onProgress({
      type: 'status',
      status: 'multi_gpu',
      message: `${splits.length}개 GPU 병렬 생성 (${splits.map((s) => `GPU${s.gpu}:${s.batchSize}장`).join(' + ')})`,
    });
  }

  // Track per-GPU progress to aggregate
  const gpuProgress = new Map<string, { step: number; totalSteps: number; elapsed: number }>();

  const promises = splits.map(async ({ gpu, batchSize, seedOffset }) => {
    const configPath = path.join(
      request.outputDir,
      `.gen-config-${Date.now()}-gpu${gpu}.json`
    );

    const seed = request.seed != null && request.seed >= 0
      ? request.seed + seedOffset
      : -1;

    const config = {
      prompt: request.prompt,
      negativePrompt: request.negativePrompt ?? '',
      width: request.width,
      height: request.height,
      steps: request.steps,
      cfgScale: request.cfgScale,
      batchSize,
      seed,
      outputDir: request.outputDir,
      modelId: request.modelId || DEFAULT_DIFFUSERS_MODEL,
      gpu,
      scheduler: request.scheduler || 'euler_a',
      ...(request.loraPath ? { loraPath: request.loraPath } : {}),
      ...(request.loraWeight != null ? { loraWeight: request.loraWeight } : {}),
    };

    await writeFile(configPath, JSON.stringify(config), 'utf-8');

    try {
      const perGpuProgress = onProgress
        ? (event: ProgressEvent) => {
            if (event.type === 'progress') {
              gpuProgress.set(gpu, {
                step: event.step,
                totalSteps: event.totalSteps,
                elapsed: event.elapsed,
              });
              // Aggregate progress across all GPUs
              let totalStep = 0;
              let totalSteps = 0;
              let maxElapsed = 0;
              for (const p of gpuProgress.values()) {
                totalStep += p.step;
                totalSteps += p.totalSteps;
                maxElapsed = Math.max(maxElapsed, p.elapsed);
              }
              const aggregatedProgress = totalSteps > 0
                ? Math.round((totalStep / totalSteps) * 100)
                : 0;
              onProgress({
                type: 'progress',
                step: totalStep,
                totalSteps,
                progress: aggregatedProgress,
                elapsed: maxElapsed,
              });
            } else {
              // Forward status events with GPU label
              onProgress({
                ...event,
                message: `[GPU${gpu}] ${event.type === 'status' ? event.message : ''}`,
              } as ProgressEvent);
            }
          }
        : undefined;

      const result = await runPythonScript(configPath, perGpuProgress);
      if (!result.success) {
        throw new Error(result.error || `GPU ${gpu}에서 이미지 생성 실패`);
      }
      return result;
    } finally {
      await unlink(configPath).catch(() => {});
    }
  });

  const results = await Promise.all(promises);

  // Merge results from all GPUs
  const allImages = results.flatMap((r) =>
    (r.images ?? []).map((img) => ({
      base64: '',
      seed: img.seed,
      width: img.width,
      height: img.height,
      filePath: img.filename,
    }))
  );

  return {
    images: allImages,
    prompt: results[0]?.prompt || request.prompt,
    negativePrompt: results[0]?.negativePrompt || request.negativePrompt || '',
  };
}

function runPythonScript(
  configPath: string,
  onProgress?: (event: ProgressEvent) => void,
): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();

    const child = spawn(pythonPath, [SCRIPT_PATH, '--config', configPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      timeout: 600_000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      // Parse progress lines
      for (const line of chunk.split('\n')) {
        const progressMatch = line.match(/\[PROGRESS\](.+)/);
        if (progressMatch) {
          try {
            const event = JSON.parse(progressMatch[1]) as ProgressEvent;
            onProgress?.(event);
          } catch {
            // ignore parse errors
          }
        } else if (line.includes('[image-gen]')) {
          console.log(line.trimEnd());
        }
      }
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `이미지 생성 프로세스 실패 (코드 ${code}): ${stderr.slice(-500)}`
          )
        );
        return;
      }

      try {
        const lines = stdout.trim().split('\n');
        const jsonLine = lines[lines.length - 1];
        const result = JSON.parse(jsonLine) as ScriptResult;
        resolve(result);
      } catch {
        reject(new Error(`이미지 생성 결과 파싱 실패: ${stdout.slice(-300)}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`이미지 생성 프로세스 시작 실패: ${err.message}`));
    });
  });
}

/**
 * Quick check if diffusers is available in the Python environment.
 */
export async function checkDiffusersAvailable(): Promise<{
  ok: boolean;
  message: string;
}> {
  return new Promise((resolve) => {
    const pythonPath = getPythonPath();

    const child = spawn(
      pythonPath,
      ['-c', 'import diffusers, torch; print(f"diffusers={diffusers.__version__} torch={torch.__version__} cuda={torch.cuda.is_available()}")'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
      }
    );

    let stdout = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.includes('diffusers=')) {
        resolve({ ok: true, message: stdout.trim() });
      } else {
        resolve({
          ok: false,
          message: 'diffusers가 설치되지 않았습니다. pip install diffusers torch를 실행하세요.',
        });
      }
    });

    child.on('error', () => {
      resolve({ ok: false, message: `Python을 찾을 수 없습니다: ${pythonPath}` });
    });
  });
}
