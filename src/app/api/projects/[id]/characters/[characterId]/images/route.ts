import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getCharacter } from '@/lib/db/queries/characters';
import {
  createCharacterImage,
  listCharacterImages,
} from '@/lib/db/queries/character-images';
import { getDefaultImageProvider, setImageProvider } from '@/lib/db/queries/image-provider-settings';
import { generateCharacterImages, previewPrompt } from '@/lib/image-gen/image-generation-service';
import { withGpuForImageGen, VramCoordinationError } from '@/lib/image-gen/vram-coordinator';
import { DEFAULT_DIFFUSERS_MODEL, type ImageKind } from '@/lib/image-gen/types';

const VALID_KINDS: ImageKind[] = ['profile', 'full-body', 'illustration'];

/** GET: List gallery images for a character */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') as ImageKind | null;

  if (kind && !VALID_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `잘못된 이미지 종류입니다. (${VALID_KINDS.join(', ')})` },
      { status: 400 }
    );
  }

  const images = await listCharacterImages(db, characterId, kind ?? undefined);
  return NextResponse.json(images);
}

/** POST: Generate images for a character */
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
    previewOnly,
  } = body as {
    kind?: ImageKind;
    additionalPrompt?: string;
    batchSize?: number;
    previewOnly?: boolean;
  };

  if (!VALID_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `잘못된 이미지 종류입니다. (${VALID_KINDS.join(', ')})` },
      { status: 400 }
    );
  }

  const character = await getCharacter(db, characterId);
  if (!character) {
    return NextResponse.json(
      { error: '캐릭터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  // Preview only: return the built prompt without generating
  if (previewOnly) {
    const provider = await getDefaultImageProvider(db, projectId);
    const preview = previewPrompt(
      character,
      kind,
      additionalPrompt,
      provider?.defaultNegativePrompt
    );
    return NextResponse.json(preview);
  }

  // Get or create default image provider settings (diffusers works out-of-box)
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

  // A1111 requires baseUrl; diffusers doesn't
  if (provider.providerType === 'automatic1111' && !provider.baseUrl) {
    return NextResponse.json(
      { error: 'Automatic1111 설정에 Base URL이 필요합니다.' },
      { status: 400 }
    );
  }

  try {
    // VRAM coordination: stop inference server → generate → restart
    const savedImages = await withGpuForImageGen(() =>
      generateCharacterImages({
        character: { ...character, id: character.id },
        projectId,
        kind,
        additionalPrompt,
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
      })
    );

    // Save all generated images to the gallery
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

    return NextResponse.json(dbImages, { status: 201 });
  } catch (err) {
    if (err instanceof VramCoordinationError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : '이미지 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
