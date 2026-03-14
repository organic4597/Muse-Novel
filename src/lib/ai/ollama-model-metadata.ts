import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const REQUEST_TIMEOUT_MS = 10_000;

type OllamaTagModel = {
  name?: string;
  details?: {
    parameter_size?: string;
  };
};

type OllamaTagsResponse = {
  models?: OllamaTagModel[];
};

type OllamaShowResponse = {
  details?: {
    parameter_size?: string;
  };
  model_info?: Record<string, unknown>;
};

type GpuMemorySummary = {
  deviceCount: number;
  maxMiB: number;
  totalMiB: number;
};

export type OllamaModelOption = {
  name: string;
  maxContextSize: number | null;
  recommendedContextSize: number | null;
  parameterSizeBillions: number | null;
};

function parseParameterSizeBillions(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const normalized = raw.trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([BM])/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  return match[2].toUpperCase() === 'M' ? value / 1000 : value;
}

function parseMaxContextSize(modelInfo: Record<string, unknown> | undefined): number | null {
  if (!modelInfo) {
    return null;
  }

  const contextCandidates = Object.entries(modelInfo)
    .filter(([key]) => key.includes('context_length'))
    .map(([, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    })
    .filter((value): value is number => value !== null && value > 0);

  if (contextCandidates.length === 0) {
    return null;
  }

  return Math.max(...contextCandidates);
}

function inferMaxContextSizeFromModelName(modelName: string): number | null {
  const normalized = modelName.toLowerCase();
  if (normalized.includes('qwen2.5') || normalized.includes('qwen3')) {
    return 32_768;
  }
  if (normalized.includes('qwen2')) {
    return 8_192;
  }
  if (normalized.includes('llama3.1') || normalized.includes('llama3.2') || normalized.includes('llama3.3')) {
    return 8_192;
  }
  if (normalized.includes('mistral') || normalized.includes('mixtral')) {
    return 32_768;
  }
  if (normalized.includes('gemma2') || normalized.includes('gemma3')) {
    return 8_192;
  }
  return null;
}

async function getGpuMemorySummary(): Promise<GpuMemorySummary | null> {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=memory.total',
      '--format=csv,noheader,nounits',
    ]);

    const values = stdout
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (values.length === 0) {
      return null;
    }

    return {
      deviceCount: values.length,
      maxMiB: Math.max(...values),
      totalMiB: values.reduce((sum, value) => sum + value, 0),
    };
  } catch {
    return null;
  }
}

function roundDownToNearest(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function recommendContextSize(
  maxContextSize: number | null,
  parameterSizeBillions: number | null,
  gpu: GpuMemorySummary | null
): number | null {
  let recommended = 4096;

  if (gpu) {
    if (parameterSizeBillions !== null) {
      if (parameterSizeBillions <= 4) {
        recommended = gpu.totalMiB >= 20_000 ? 16_384 : 8_192;
      } else if (parameterSizeBillions <= 8) {
        recommended = gpu.totalMiB >= 20_000 ? 12_288 : 8_192;
      } else if (parameterSizeBillions <= 16) {
        recommended = gpu.totalMiB >= 20_000 ? 8_192 : 4_096;
      } else if (parameterSizeBillions <= 24) {
        recommended = gpu.totalMiB >= 24_000 ? 4_096 : 2_048;
      } else {
        recommended = 2_048;
      }
    } else if (gpu.maxMiB >= 16_000) {
      recommended = 12_288;
    } else if (gpu.totalMiB >= 20_000 || gpu.maxMiB >= 12_000) {
      recommended = 8_192;
    } else if (gpu.maxMiB >= 8_000) {
      recommended = 4_096;
    } else {
      recommended = 2_048;
    }
  }

  if (maxContextSize !== null) {
    recommended = Math.min(recommended, maxContextSize);
  }

  const rounded = roundDownToNearest(recommended, 1024);
  return Math.max(1024, rounded);
}

export async function listOllamaModelOptions(
  baseUrl: string
): Promise<OllamaModelOption[]> {
  const res = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Ollama 서버 응답 오류: ${res.status}`);
  }

  const data = (await res.json()) as OllamaTagsResponse;
  const gpu = await getGpuMemorySummary();

  const models = (data.models ?? []).filter(
    (model): model is OllamaTagModel & { name: string } => typeof model.name === 'string'
  );

  const details = models.map((model) => {
    const parameterSizeBillions = parseParameterSizeBillions(model.details?.parameter_size);
    const maxContextSize = inferMaxContextSizeFromModelName(model.name);

    return {
      name: model.name,
      maxContextSize,
      recommendedContextSize: recommendContextSize(
        maxContextSize,
        parameterSizeBillions,
        gpu
      ),
      parameterSizeBillions,
    } satisfies OllamaModelOption;
  });

  return details.sort((left, right) => left.name.localeCompare(right.name));
}