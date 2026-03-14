import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { listChapters } from '@/lib/db/queries/chapters';
import { getCharacter } from '@/lib/db/queries/characters';
import { extractTextFromPlateJson } from '@/lib/character-mentions';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { id: projectId, characterId } = await params;

  const character = await getCharacter(db, characterId);
  if (!character) {
    return NextResponse.json(
      { error: '캐릭터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const chapters = await listChapters(db, projectId);

  const appearances = chapters
    .filter((chapter) => {
      const text = extractTextFromPlateJson(chapter.contentJson);
      return text.includes(character.name);
    })
    .map((chapter) => ({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterOrder: chapter.order,
    }));

  return NextResponse.json({ appearances });
}
