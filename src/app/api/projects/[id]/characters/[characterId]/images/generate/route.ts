import { db } from '@/lib/db';
import { createCharacterImage } from '@/lib/db/queries/character-images';
import { getCharacter } from '@/lib/db/queries/characters';
import { getExternalService } from '@/lib/db/queries/external-services';
import {
  getDefaultImageProvider,
  setImageProvider,
} from '@/lib/db/queries/image-provider-settings';
import { generateCharacterImages } from '@/lib/image-gen/image-generation-service';
import { getLoraRegistry } from '@/lib/image-gen/lora-registry';
import {
  DEFAULT_DIFFUSERS_MODEL,
  type ImageGenerationTimings,
  type ImageKind,
} from '@/lib/image-gen/types';

const VALID_KINDS: ImageKind[] = ['profile', 'full-body', 'illustration'];

function mergeTimings(
  current: ImageGenerationTimings,
  next?: ImageGenerationTimings
): ImageGenerationTimings {
  if (!next) {
    return current;
  }

  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(next).filter((entry): entry is [keyof ImageGenerationTimings, number] => {
        const [, value] = entry;
        return typeof value === 'number';
      })
    ),
  };
}

/**
 * POST: Generate images with Server-Sent Events for progress.
 * The response streams SSE events:
 *   event: status   data: { status, message }
 *   event: progress data: { step, totalSteps, progress, elapsed }
 *   event: complete data: { images: [...] }
 *   event: error    data: { error }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { id: projectId, characterId } = await params;
  const body = await request.json();

  const {
    kind = 'profile',
    additionalPrompt,
    batchSize,
    loraId,
    loraWeight,
  } = body as {
    kind?: ImageKind;
    additionalPrompt?: string;
    batchSize?: number;
    loraId?: string;
    loraWeight?: number;
  };

  if (!VALID_KINDS.includes(kind)) {
    return new Response(
      JSON.stringify({ error: `잘못된 이미지 종류입니다.` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const character = await getCharacter(db, characterId);
  if (!character) {
    return new Response(
      JSON.stringify({ error: '캐릭터를 찾을 수 없습니다.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let provider = await getDefaultImageProvider(db, projectId);
  if (!provider) {
    provider = await setImageProvider(db, projectId, {
      providerType: 'diffusers',
      baseUrl: 'http://127.0.0.1:7861',
      modelName: DEFAULT_DIFFUSERS_MODEL,
      isDefault: true,
      defaultWidth: 1024,
      defaultHeight: 1024,
      defaultSteps: 24,
      defaultSampler: 'euler_a',
      defaultCfgScale: 6,
    });
  }

  if (!provider.baseUrl) {
    return new Response(
      JSON.stringify({ error: '이미지 생성 API Base URL이 필요합니다.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      // Resolve LoRA metadata for the external image API.
      let resolvedLoraWeight: number | undefined;
      let loraEntry: Awaited<ReturnType<typeof getLoraRegistry>>[number] | undefined;
      if (loraId) {
        const registry = await getLoraRegistry();
        loraEntry = registry.find((l) => l.id === loraId);
        if (loraEntry) {
          resolvedLoraWeight = loraWeight ?? loraEntry?.recommendedWeight ?? 1.0;
        }
      }

      send('status', {
        status: 'starting',
        message: '이미지 생성 API 호출 준비 중...',
      });

      // Run the generation pipeline
      (async () => {
        const requestStart = performance.now();
        let timings: ImageGenerationTimings = {};

        try {
          send('status', {
            status: 'api_ready',
            message: '외부 이미지 API에 요청 중...',
            stage: 'api_request',
            timings,
          });

          const tagService = await getExternalService(db, 'tag-recommender');

          const savedImages = await generateCharacterImages({
            character: { ...character, id: character.id },
            projectId,
            kind,
            additionalPrompt: loraEntry?.triggerWords?.length
              ? [loraEntry.triggerWords.join(', '), additionalPrompt].filter(Boolean).join(', ')
              : additionalPrompt,
            batchSize,
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
            onProgress: (event) => {
              timings = mergeTimings(timings, event.timings);
              if (event.type === 'progress') {
                send('progress', event);
              } else if (event.type === 'status') {
                send('status', event);
              }
            },
            loraId,
            loraWeight: resolvedLoraWeight,
            tagServiceBaseUrl: tagService?.baseUrl,
          });

          // Save to DB
          const dbSaveStart = performance.now();
          send('status', {
            status: 'saving_db',
            message: '갤러리에 저장 중...',
            timings,
          });

          const dbImages: Awaited<ReturnType<typeof createCharacterImage>>[] = [];
          for (const img of savedImages) {
            const dbImage = await createCharacterImage(db, {
              characterId,
              projectId,
              imagePath: img.filePath,
              kind,
              prompt: img.prompt,
              negativePrompt: img.negativePrompt,
              providerType: provider.providerType,
              modelName: provider.modelName ?? undefined,
              width: img.width,
              height: img.height,
              seed: img.seed,
            });
            dbImages.push(dbImage);
          }

          timings = mergeTimings(timings, {
            dbSaveMs: Math.round(performance.now() - dbSaveStart),
          });

          timings = mergeTimings(timings, {
            totalMs: Math.round(performance.now() - requestStart),
          });

          send('complete', { images: dbImages, timings });
        } catch (err) {
          timings = mergeTimings(timings, {
            totalMs: Math.round(performance.now() - requestStart),
          });

          const message =
            err instanceof Error ? err.message : '이미지 생성에 실패했습니다.';
          send('error', { error: message, timings });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
