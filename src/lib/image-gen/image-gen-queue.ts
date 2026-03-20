/**
 * Image Generation Queue — in-memory singleton for sequential batch processing.
 *
 * Jobs are enqueued by the API and processed one at a time by an async worker loop.
 * Uses globalThis singleton pattern for Next.js hot-reload safety.
 */

import { db } from '@/lib/db';
import { createCharacterImage } from '@/lib/db/queries/character-images';
import { getCharacter } from '@/lib/db/queries/characters';
import {
  getDefaultImageProvider,
  setImageProvider,
} from '@/lib/db/queries/image-provider-settings';
import { generateCharacterImages } from './image-generation-service';
import { getLoraFilePath, getLoraRegistry } from './lora-registry';
import { DEFAULT_DIFFUSERS_MODEL, type ImageKind } from './types';
import { acquireGpuForImageGen } from './vram-coordinator';

// ── Types ──────────────────────────────────────────────────────────────

export type QueueJobStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

export type QueueJob = {
  id: string;
  projectId: string;
  characterId: string;
  characterName: string;
  kind: ImageKind;
  additionalPrompt?: string;
  batchSize: number;
  loraId?: string;
  loraWeight?: number;
  status: QueueJobStatus;
  error?: string;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  resultCount?: number;
};

type EnqueueParams = Omit<QueueJob, 'id' | 'status' | 'enqueuedAt'>;

// ── Queue Implementation ───────────────────────────────────────────────

class ImageGenQueue {
  private jobs: QueueJob[] = [];
  private processing = false;

  /** Add a job to the queue. Returns the job id. */
  enqueue(params: EnqueueParams): string {
    const id = crypto.randomUUID();
    const job: QueueJob = {
      ...params,
      id,
      status: 'pending',
      enqueuedAt: Date.now(),
    };
    this.jobs.push(job);
    this.tick();
    return id;
  }

  /** Return a snapshot (copy) of all jobs. */
  getSnapshot(): QueueJob[] {
    return this.jobs.map((j) => ({ ...j }));
  }

  /** Return a single job by id. */
  getJob(jobId: string): QueueJob | undefined {
    const job = this.jobs.find((j) => j.id === jobId);
    return job ? { ...job } : undefined;
  }

  /** Cancel a pending job. Returns true if cancelled. */
  cancel(jobId: string): boolean {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job || job.status !== 'pending') return false;
    job.status = 'cancelled';
    job.completedAt = Date.now();
    return true;
  }

  /** Remove done / error / cancelled jobs from the list. */
  clearCompleted(): void {
    this.jobs = this.jobs.filter(
      (j) => j.status === 'pending' || j.status === 'running'
    );
  }

  // ── Worker loop ────────────────────────────────────────────────────

  private tick(): void {
    if (this.processing) return;
    const next = this.jobs.find((j) => j.status === 'pending');
    if (!next) return;

    this.processing = true;
    void this.processJob(next).finally(() => {
      this.processing = false;
      // Check if more pending jobs exist
      this.tick();
    });
  }

  private async processJob(job: QueueJob): Promise<void> {
    job.status = 'running';
    job.startedAt = Date.now();

    let releaseGpu: (() => Promise<void>) | null = null;

    try {
      // 1. Lookup character
      const character = await getCharacter(db, job.characterId);
      if (!character) {
        throw new Error('캐릭터를 찾을 수 없습니다.');
      }

      // 2. Lookup / create image provider
      let provider = await getDefaultImageProvider(db, job.projectId);
      if (!provider) {
        provider = await setImageProvider(db, job.projectId, {
          providerType: 'diffusers',
          modelName: DEFAULT_DIFFUSERS_MODEL,
          isDefault: true,
          defaultWidth: 1024,
          defaultHeight: 1024,
          defaultSteps: 24,
          defaultSampler: 'euler_a',
          defaultCfgScale: 6,
        });
      }

      // 3. Resolve LoRA
      let loraPath: string | undefined;
      let resolvedLoraWeight: number | undefined;
      let loraEntry: Awaited<ReturnType<typeof getLoraRegistry>>[number] | undefined;
      if (job.loraId) {
        const registry = await getLoraRegistry();
        loraEntry = registry.find((l) => l.id === job.loraId);
        const resolved = getLoraFilePath(job.loraId, registry);
        if (resolved) {
          loraPath = resolved;
          resolvedLoraWeight = job.loraWeight ?? loraEntry?.recommendedWeight ?? 1.0;
        }
      }

      // 4. Acquire GPU
      releaseGpu = await acquireGpuForImageGen();

      // 5. Generate images
      const savedImages = await generateCharacterImages({
        character: { ...character, id: character.id },
        projectId: job.projectId,
        kind: job.kind,
        additionalPrompt: loraEntry?.triggerWords?.length
          ? [loraEntry.triggerWords.join(', '), job.additionalPrompt].filter(Boolean).join(', ')
          : job.additionalPrompt,
        batchSize: job.batchSize,
        provider: {
          providerType: provider.providerType,
          baseUrl: provider.baseUrl,
          modelName: provider.modelName,
          defaultWidth: provider.defaultWidth,
          defaultHeight: provider.defaultHeight,
          defaultSteps: provider.defaultSteps,
          defaultSampler: provider.defaultSampler,
          defaultCfgScale: provider.defaultCfgScale,
          defaultNegativePrompt: provider.defaultNegativePrompt,
        },
        loraPath,
        loraWeight: resolvedLoraWeight,
      });

      // 6. Save to DB
      for (const img of savedImages) {
        await createCharacterImage(db, {
          characterId: job.characterId,
          projectId: job.projectId,
          imagePath: img.filePath,
          kind: job.kind,
          prompt: img.prompt,
          negativePrompt: img.negativePrompt,
          providerType: provider.providerType,
          modelName: provider.modelName ?? undefined,
          width: img.width,
          height: img.height,
          seed: img.seed,
        });
      }

      // 7. Release GPU
      if (releaseGpu) {
        await releaseGpu();
        releaseGpu = null;
      }

      // 8. Mark done
      job.status = 'done';
      job.completedAt = Date.now();
      job.resultCount = savedImages.length;

      console.log(
        `[image-gen-queue] Job ${job.id} done — ${savedImages.length} images generated`
      );
    } catch (err) {
      // Release GPU on error
      if (releaseGpu) {
        await releaseGpu().catch(() => {});
        releaseGpu = null;
      }

      job.status = 'error';
      job.completedAt = Date.now();
      job.error = err instanceof Error ? err.message : '이미지 생성에 실패했습니다.';

      console.error(`[image-gen-queue] Job ${job.id} failed:`, job.error);
    }
  }
}

// ── globalThis Singleton ───────────────────────────────────────────────

const globalForQueue = globalThis as typeof globalThis & {
  __imageGenQueue?: ImageGenQueue;
};

const imageGenQueue =
  globalForQueue.__imageGenQueue ?? new ImageGenQueue();

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.__imageGenQueue = imageGenQueue;
}

// ── Public API ─────────────────────────────────────────────────────────

export function enqueueJob(params: EnqueueParams): string {
  return imageGenQueue.enqueue(params);
}

export function getQueueSnapshot(): QueueJob[] {
  return imageGenQueue.getSnapshot();
}

export function getJob(jobId: string): QueueJob | undefined {
  return imageGenQueue.getJob(jobId);
}

export function cancelJob(jobId: string): boolean {
  return imageGenQueue.cancel(jobId);
}

export function clearCompleted(): void {
  imageGenQueue.clearCompleted();
}
