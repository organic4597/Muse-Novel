import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  createCharacterImage,
  listCharacterImages,
} from '@/lib/db/queries/character-images';
import { getCharacter } from '@/lib/db/queries/characters';
import { getExternalService } from '@/lib/db/queries/external-services';
import { getDefaultImageProvider, setImageProvider } from '@/lib/db/queries/image-provider-settings';
import { generateCharacterImages, previewPrompt } from '@/lib/image-gen/image-generation-service';
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
    const preview = previewPrompt({
      character,
      kind,
      additionalPrompt,
      providerNegativePrompt: provider?.defaultNegativePrompt,
    });
    return NextResponse.json(preview);
  }

  // Get or create default image API settings.
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
    return NextResponse.json(
      { error: '이미지 생성 API Base URL이 필요합니다.' },
      { status: 400 }
    );
  }

  try {
    const tagService = await getExternalService(db, 'tag-recommender');
    const savedImages = await generateCharacterImages({
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
        tagServiceBaseUrl: tagService?.baseUrl,
      });

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
    const message = err instanceof Error ? err.message : '이미지 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
