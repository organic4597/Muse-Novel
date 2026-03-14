import { db } from '@/lib/db';
import { getCharacter } from '@/lib/db/queries/characters';
import { createCharacterImage } from '@/lib/db/queries/character-images';
import {
  getDefaultImageProvider,
  setImageProvider,
} from '@/lib/db/queries/image-provider-settings';
import { generateCharacterImages } from '@/lib/image-gen/image-generation-service';
import {
  withGpuForImageGen,
  VramCoordinationError,
} from '@/lib/image-gen/vram-coordinator';
import { DEFAULT_DIFFUSERS_MODEL, type ImageKind } from '@/lib/image-gen/types';
import { getLoraRegistry, getLoraFilePath } from '@/lib/image-gen/lora-registry';

const VALID_KINDS: ImageKind[] = ['profile', 'full-body', 'illustration'];

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
      modelName: DEFAULT_DIFFUSERS_MODEL,
      isDefault: true,
      defaultWidth: 1024,
      defaultHeight: 1024,
      defaultSteps: 24,
      defaultSampler: 'euler_a',
      defaultCfgScale: 6,
    });
  }

  if (provider.providerType === 'automatic1111' && !provider.baseUrl) {
    return new Response(
      JSON.stringify({ error: 'Automatic1111 설정에 Base URL이 필요합니다.' }),
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

      // Resolve LoRA if requested
      let loraPath: string | undefined;
      let resolvedLoraWeight: number | undefined;
      let loraEntry: Awaited<ReturnType<typeof getLoraRegistry>>[number] | undefined;
      if (loraId) {
        const registry = await getLoraRegistry();
        loraEntry = registry.find((l) => l.id === loraId);
        const resolved = getLoraFilePath(loraId, registry);
        if (resolved) {
          loraPath = resolved;
          resolvedLoraWeight = loraWeight ?? loraEntry?.recommendedWeight ?? 1.0;
        }
      }

      send('status', {
        status: 'starting',
        message: 'VRAM 확보 중... 추론 서버를 잠시 중지합니다.',
      });

      // Run the generation pipeline
      (async () => {
        try {
          const savedImages = await withGpuForImageGen(async () => {
            send('status', {
              status: 'gpu_ready',
              message: 'GPU 확보 완료. 이미지 생성 준비 중...',
            });

            return generateCharacterImages({
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
                if (event.type === 'progress') {
                  send('progress', event);
                } else if (event.type === 'status') {
                  send('status', event);
                }
              },
              loraPath,
              loraWeight: resolvedLoraWeight,
            });
          });

          // Save to DB
          send('status', {
            status: 'saving_db',
            message: '갤러리에 저장 중...',
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

          send('complete', { images: dbImages });
        } catch (err) {
          if (err instanceof VramCoordinationError) {
            send('error', { error: err.message });
          } else {
            const message =
              err instanceof Error ? err.message : '이미지 생성에 실패했습니다.';
            send('error', { error: message });
          }
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
