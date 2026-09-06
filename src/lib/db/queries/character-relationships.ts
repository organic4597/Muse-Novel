import { eq, or, sql } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { characterRelationships, characters } from '../schema';

type CreateRelationshipData = {
  characterAId: string;
  characterBId: string;
  relationshipType: string;
  description?: string;
};

type UpdateRelationshipData = {
  relationshipType?: string;
  description?: string;
};

export async function createRelationship(
  db: DB,
  data: CreateRelationshipData
) {
  if (data.characterAId === data.characterBId) {
    throw new Error('같은 캐릭터 간의 관계는 만들 수 없습니다.');
  }

  const rows = db
    .insert(characterRelationships)
    .values({
      characterAId: data.characterAId,
      characterBId: data.characterBId,
      relationshipType: data.relationshipType,
      description: data.description ?? null,
    })
    .returning()
    .all();

  return rows[0];
}

export async function getRelationship(db: DB, id: string) {
  const rows = db
    .select()
    .from(characterRelationships)
    .where(eq(characterRelationships.id, id))
    .all();

  return rows[0] ?? undefined;
}

export async function listRelationshipsForCharacter(
  db: DB,
  characterId: string
) {
  // Bidirectional query: find relationships where the character is A or B
  // Then join to get the OTHER character's name
  const rows = db
    .select({
      id: characterRelationships.id,
      characterAId: characterRelationships.characterAId,
      characterBId: characterRelationships.characterBId,
      relationshipType: characterRelationships.relationshipType,
      description: characterRelationships.description,
      createdAt: characterRelationships.createdAt,
      otherCharacterName: sql<string>`
        CASE
          WHEN ${characterRelationships.characterAId} = ${characterId}
          THEN (SELECT ${characters.name} FROM ${characters} WHERE ${characters.id} = ${characterRelationships.characterBId})
          ELSE (SELECT ${characters.name} FROM ${characters} WHERE ${characters.id} = ${characterRelationships.characterAId})
        END
      `.as('other_character_name'),
      otherCharacterId: sql<string>`
        CASE
          WHEN ${characterRelationships.characterAId} = ${characterId}
          THEN ${characterRelationships.characterBId}
          ELSE ${characterRelationships.characterAId}
        END
      `.as('other_character_id'),
    })
    .from(characterRelationships)
    .where(
      or(
        eq(characterRelationships.characterAId, characterId),
        eq(characterRelationships.characterBId, characterId)
      )
    )
    .all();

  return rows;
}

/** Loads every relationship for a project in one query for memory indexing. */
export async function listRelationshipsForProject(db: DB, projectId: string) {
  return db
    .select({
      characterAId: characterRelationships.characterAId,
      characterBId: characterRelationships.characterBId,
      description: characterRelationships.description,
      id: characterRelationships.id,
      relationshipType: characterRelationships.relationshipType,
    })
    .from(characterRelationships)
    .innerJoin(
      characters,
      eq(characterRelationships.characterAId, characters.id)
    )
    .where(eq(characters.projectId, projectId))
    .all();
}

export async function updateRelationship(
  db: DB,
  id: string,
  data: UpdateRelationshipData
) {
  const rows = db
    .update(characterRelationships)
    .set(data)
    .where(eq(characterRelationships.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}

export async function deleteRelationship(db: DB, id: string) {
  db.delete(characterRelationships)
    .where(eq(characterRelationships.id, id))
    .run();
}
