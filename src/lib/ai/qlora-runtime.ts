import fs from 'fs';
import path from 'path';

export function getQloraPythonPath(): string {
  const candidates = [
    process.env.QLORA_PYTHON_PATH,
    path.join(process.cwd(), 'scripts', '.venv', 'bin', 'python'),
    path.join(process.cwd(), 'doc-to-lora', '.venv', 'bin', 'python'),
    'python',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate === 'python' || fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'python';
}

export function getQloraBaseModel(): string {
  return process.env.QLORA_BASE_MODEL ?? 'Qwen/Qwen3.5-9B-Base';
}

export function getHuggingFaceToken(): string | undefined {
  return process.env.HUGGING_FACE_HUB_TOKEN ?? process.env.HF_TOKEN;
}