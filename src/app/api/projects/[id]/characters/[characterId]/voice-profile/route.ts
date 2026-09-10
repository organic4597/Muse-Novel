import { NextResponse } from 'next/server';

import { extractCharacterVoiceProfile } from '@/lib/ai/character-voice-profile';
import { longTaskResponse } from '@/lib/ai/long-task-stream';
import { db } from '@/lib/db';
import { getCharacter } from '@/lib/db/queries/characters';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { id, characterId } = await params;
  const character = await getCharacter(db, characterId);
  if (!character || character.projectId !== id) {
    return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
  }
  return longTaskResponse(request, (signal, progress) =>
    extractCharacterVoiceProfile({
      characterId,
      db,
      progress,
      projectId: id,
      signal,
    })
  );
}
