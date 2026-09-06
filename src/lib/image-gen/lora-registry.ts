import { readFile } from 'fs/promises';
import path from 'path';
import type { LoraEntry } from '@/lib/image-gen/types';

const REGISTRY_PATH = path.join(process.cwd(), 'config', 'lora-registry.json');

export async function getLoraRegistry(): Promise<LoraEntry[]> {
  try {
    const raw = await readFile(REGISTRY_PATH, 'utf-8');
    return JSON.parse(raw) as LoraEntry[];
  } catch {
    return [];
  }
}

export function getLoraFilePath(loraId: string, registry: LoraEntry[]): string | null {
  const entry = registry.find((l) => l.id === loraId);
  if (!entry) return null;
  return path.join(process.cwd(), 'data', 'loras', entry.filename);
}
