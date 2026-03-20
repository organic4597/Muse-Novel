import {
  clearCompleted,
  enqueueJob,
  getQueueSnapshot,
  type QueueJob,
} from '@/lib/image-gen/image-gen-queue';
import type { ImageKind } from '@/lib/image-gen/types';

const VALID_KINDS: ImageKind[] = ['profile', 'full-body', 'illustration'];

type EnqueueBody = {
  projectId: string;
  characterId: string;
  characterName: string;
  kind: ImageKind;
  additionalPrompt?: string;
  batchSize: number;
  loraId?: string;
  loraWeight?: number;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST — Enqueue a new image generation job.
 * Body: EnqueueBody
 * Returns: { jobId: string }
 */
export async function POST(request: Request) {
  const body = (await request.json()) as EnqueueBody;

  const { projectId, characterId, characterName, kind, additionalPrompt, batchSize, loraId, loraWeight } = body;

  if (!projectId || !characterId || !characterName) {
    return json({ error: '필수 파라미터가 누락되었습니다.' }, 400);
  }

  if (!kind || !VALID_KINDS.includes(kind)) {
    return json({ error: '잘못된 이미지 종류입니다.' }, 400);
  }

  if (!batchSize || batchSize < 1 || batchSize > 8) {
    return json({ error: '생성 장수는 1~8 사이여야 합니다.' }, 400);
  }

  const jobId = enqueueJob({
    projectId,
    characterId,
    characterName,
    kind,
    additionalPrompt: additionalPrompt || undefined,
    batchSize,
    loraId: loraId || undefined,
    loraWeight: loraId ? loraWeight : undefined,
  });

  return json({ jobId });
}

/**
 * GET — Return the current queue snapshot.
 * Query params:
 *   ?action=clear — clear completed/error/cancelled jobs and return updated snapshot.
 * Returns: { jobs: QueueJob[] }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'clear') {
    clearCompleted();
  }

  const jobs: QueueJob[] = getQueueSnapshot();
  return json({ jobs });
}
