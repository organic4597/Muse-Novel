import { and, desc, eq, like } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { characters, worldEntries } from '@/lib/db/schema';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';

  let characterResults: { id: string; text: string; category: 'character' }[];
  let worldResults: { id: string; text: string; category: 'world' }[];

  if (q) {
    const pattern = `%${q}%`;

    const charRows = db
      .select({ id: characters.id, name: characters.name })
      .from(characters)
      .where(and(eq(characters.projectId, id), like(characters.name, pattern)))
      .limit(10)
      .all();

    characterResults = charRows.map((row) => ({
      id: row.id,
      text: row.name,
      category: 'character' as const,
    }));

    const worldRows = db
      .select({ id: worldEntries.id, title: worldEntries.title })
      .from(worldEntries)
      .where(
        and(eq(worldEntries.projectId, id), like(worldEntries.title, pattern))
      )
      .limit(10)
      .all();

    worldResults = worldRows.map((row) => ({
      id: row.id,
      text: row.title,
      category: 'world' as const,
    }));
  } else {
    const charRows = db
      .select({ id: characters.id, name: characters.name })
      .from(characters)
      .where(eq(characters.projectId, id))
      .orderBy(desc(characters.createdAt))
      .limit(10)
      .all();

    characterResults = charRows.map((row) => ({
      id: row.id,
      text: row.name,
      category: 'character' as const,
    }));

    const worldRows = db
      .select({ id: worldEntries.id, title: worldEntries.title })
      .from(worldEntries)
      .where(eq(worldEntries.projectId, id))
      .orderBy(desc(worldEntries.createdAt))
      .limit(10)
      .all();

    worldResults = worldRows.map((row) => ({
      id: row.id,
      text: row.title,
      category: 'world' as const,
    }));
  }

  const items = [...characterResults, ...worldResults].slice(0, 20);

  return NextResponse.json({ items });
}
