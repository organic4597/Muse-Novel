import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd());

const removedInternalRoutes = [
  {
    path: 'src/app/api/ai/inference-status/route.ts',
    reference: '/api/ai/inference-status',
  },
  {
    path: 'src/app/api/image-gen-queue/route.ts',
    reference: '/api/image-gen-queue',
  },
  {
    path: 'src/app/api/projects/[id]/lora/cancel/route.ts',
    reference: '/lora/cancel',
  },
  {
    path: 'src/app/api/projects/[id]/lora/generate/route.ts',
    reference: '/lora/generate',
  },
  {
    path: 'src/app/api/projects/[id]/lora/training-status/route.ts',
    reference: '/lora/training-status',
  },
  {
    path: 'src/app/api/projects/[id]/settings/ai/qwen-local/start/route.ts',
    reference: '/qwen-local/start',
  },
] as const;

const deprecatedRoutes = [
  'src/app/api/projects/[id]/world-entries/search/route.ts',
  'src/app/api/projects/[id]/style-profiles/[profileId]/activate/route.ts',
] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

describe('internal API lifecycle audit', () => {
  it('keeps removed GPU/process-manager routes absent and unreferenced', () => {
    const productionSources = sourceFiles(join(ROOT, 'src'));

    for (const route of removedInternalRoutes) {
      expect(existsSync(join(ROOT, route.path)), route.path).toBe(false);
      const references = productionSources.filter((file) =>
        readFileSync(file, 'utf8').includes(route.reference)
      );
      expect(references, route.reference).toEqual([]);
    }
  });

  it('retains externally plausible legacy routes with explicit deprecation headers', () => {
    for (const route of deprecatedRoutes) {
      const source = readFileSync(join(ROOT, route), 'utf8');
      expect(source).toContain("Deprecation: 'true'");
      expect(source).toContain('rel="successor-version"');
    }
  });
});
