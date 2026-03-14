export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';

import { CharacterList } from '@/components/character/character-list';
import { db } from '@/lib/db';
import { listCharacters } from '@/lib/db/queries/characters';
import { getProject } from '@/lib/db/queries/projects';

export default async function CharactersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(db, id);

  if (!project) {
    notFound();
  }

  const characters = await listCharacters(db, id);

  return (
    <div className="space-y-6">
      <CharacterList characters={characters} projectId={id} />
    </div>
  );
}
