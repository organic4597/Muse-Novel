import { db } from '@/lib/db';
import { getCharacter } from '@/lib/db/queries/characters';
import { getExternalService } from '@/lib/db/queries/external-services';
import { deduplicateRecommendedTags } from '@/lib/image-gen/tag-normalizer';
import { recommendTags } from '@/lib/tag-recommender-client';

function buildCharacterTexts(character: {
  appearance?: string | null;
  personality?: string | null;
  backstory?: string | null;
  arcDescription?: string | null;
  role?: string | null;
}): Record<string, string> {
  const texts: Record<string, string> = {};
  if (character.appearance) texts['외모'] = character.appearance;
  if (character.personality) texts['성격'] = character.personality;
  if (character.backstory) texts['배경스토리'] = character.backstory;
  if (character.arcDescription) texts['아크'] = character.arcDescription;
  if (character.role) texts['역할'] = character.role;
  return texts;
}

// GET /api/prompt-tags/recommend?characterId=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const characterId = searchParams.get('characterId');

  if (!characterId) {
    return Response.json({ error: 'characterId required' }, { status: 400 });
  }

  const character = await getCharacter(db, characterId);
  if (!character) {
    return Response.json({ error: 'Character not found' }, { status: 404 });
  }

  const texts = buildCharacterTexts(character);
  if (Object.keys(texts).length === 0) {
    return Response.json({ characterName: character.name, recommendations: [] });
  }

  const service = await getExternalService(db, 'tag-recommender');
  let tags;
  try {
    tags = deduplicateRecommendedTags(
      await recommendTags(texts, { translate: true }, service?.baseUrl)
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : '태그 추천 API에 연결할 수 없습니다.',
      },
      { status: 503 }
    );
  }

  return Response.json({
    characterName: character.name,
    recommendations: tags,
  });
}

// POST /api/prompt-tags/recommend — description-to-tags (user input only)
export async function POST(request: Request) {
  const body = await request.json();
  const description: string = body.description ?? '';

  if (!description.trim()) {
    return Response.json({ tags: [] });
  }

  const texts: Record<string, string> = { '프롬프트': description };
  const service = await getExternalService(db, 'tag-recommender');
  const wordCount = description.trim().split(/[\s,]+/).filter(Boolean).length;
  const topK = wordCount <= 2 ? 10 : wordCount <= 5 ? 15 : 20;
  const threshold = wordCount <= 2 ? 0.35 : 0.30;
  let tags;
  try {
    tags = deduplicateRecommendedTags(
      await recommendTags(
        texts,
        {
          topK,
          threshold,
          autoSplit: false,
          translate: true,
        },
        service?.baseUrl
      )
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : '태그 추천 API에 연결할 수 없습니다.',
      },
      { status: 503 }
    );
  }

  return Response.json({ tags });
}
