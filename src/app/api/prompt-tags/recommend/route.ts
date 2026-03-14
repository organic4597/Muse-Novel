import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { getCharacter } from '@/lib/db/queries/characters';

const execFileAsync = promisify(execFile);

interface EmbeddingTag {
  tag: string;
  category: string;
  categoryLabel: string;
  color: string;
  reason: string;
  score: number;
}

interface RecommendResult {
  tags: EmbeddingTag[];
}

async function callTagRecommender(
  texts: Record<string, string>,
  topK: number = 30,
  threshold: number = 0.35,
  excludeCategories: string[] = ['artist']
): Promise<EmbeddingTag[]> {
  const configPath = path.join('/tmp', `tag-rec-${randomUUID()}.json`);
  const scriptPath = path.join(process.cwd(), 'scripts', 'tag_recommender.py');

  const config = {
    texts,
    topK,
    threshold,
    excludeCategories,
    autoSplit: true,
  };

  try {
    await writeFile(configPath, JSON.stringify(config), 'utf-8');

    const { stdout } = await execFileAsync('python3', [scriptPath, '--config', configPath], {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      cwd: process.cwd(),
    });

    // Extract JSON from stdout (skip any stderr-like lines)
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const result: RecommendResult = JSON.parse(jsonMatch[0]);
    return result.tags ?? [];
  } finally {
    await unlink(configPath).catch(() => {});
  }
}

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

  const tags = await callTagRecommender(texts);

  return Response.json({
    characterName: character.name,
    recommendations: tags,
  });
}

// POST /api/prompt-tags/recommend — description-to-tags (optionally with characterId)
export async function POST(request: Request) {
  const body = await request.json();
  const description: string = body.description ?? '';
  const characterId: string | undefined = body.characterId;

  const texts: Record<string, string> = {};

  // Add character info if characterId provided
  if (characterId) {
    const character = await getCharacter(db, characterId);
    if (character) {
      Object.assign(texts, buildCharacterTexts(character));
    }
  }

  // Add description text
  if (description.trim()) {
    texts['프롬프트'] = description;
  }

  if (Object.keys(texts).length === 0) {
    return Response.json({ tags: [] });
  }

  const tags = await callTagRecommender(texts);

  return Response.json({ tags });
}
