import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type { StoryPlanningDraft } from '@/lib/ai/story-planning-types';
import { buildWritingBlueprintFromDraft } from '@/lib/ai/writing-blueprint';
import { db } from '@/lib/db';
import { chapters, characters, projects, worldEntries } from '@/lib/db/schema';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const draft: StoryPlanningDraft = body.draft;

    if (!draft?.title?.trim()) {
      return NextResponse.json(
        { error: '소설 제목이 필요합니다.' },
        { status: 400 }
      );
    }

    // Use drizzle transaction (better-sqlite3 passes tx to callback)
    const result = db.transaction((tx) => {
      // 1. Create project
      const [project] = tx
        .insert(projects)
        .values({
          title: draft.title!.trim(),
          genre: draft.genre ?? null,
          synopsis: draft.synopsis ?? null,
          settingsJson: JSON.stringify({
            ideationSnapshot: draft,
            writingBlueprint: buildWritingBlueprintFromDraft(draft),
            createdFrom: 'story-planning',
            createdAt: new Date().toISOString(),
          }),
        })
        .returning()
        .all();

      // 2. Create characters
      const createdCharacters = draft.characters.map((ch) =>
        tx
          .insert(characters)
          .values({
            projectId: project.id,
            name: ch.name,
            role: ch.role ?? null,
            appearance: ch.appearance ?? null,
            personality: ch.personality ?? null,
            backstory: ch.backstory ?? null,
            arcDescription: ch.arcDescription ?? null,
            itemsJson: ch.items?.length ? JSON.stringify(ch.items) : null,
          })
          .returning()
          .all()[0]
      );

      // 3. Create world entries
      const createdWorldEntries = draft.worldEntries.map((we) =>
        tx
          .insert(worldEntries)
          .values({
            projectId: project.id,
            category: we.category,
            title: we.title,
            content: we.content ?? null,
          })
          .returning()
          .all()[0]
      );

      // 4. Create first chapter with outline
      let createdChapter = null;
      if (draft.firstChapterOutline) {
        const [chapter] = tx
          .insert(chapters)
          .values({
            projectId: project.id,
            title: '제 1장',
            order: 0,
          })
          .returning()
          .all();

        tx.update(chapters)
          .set({ outline: draft.firstChapterOutline, updatedAt: new Date() })
          .where(eq(chapters.id, chapter.id))
          .run();

        createdChapter = chapter;
      }

      return {
        project,
        characters: createdCharacters,
        worldEntries: createdWorldEntries,
        firstChapter: createdChapter,
      };
    });

    return NextResponse.json({
      projectId: result.project.id,
      summary: {
        title: result.project.title,
        characters: result.characters.length,
        worldEntries: result.worldEntries.length,
        hasFirstChapter: !!result.firstChapter,
      },
    });
  } catch (error) {
    console.error('[story-planning/apply] Error:', error);
    return NextResponse.json(
      { error: '프로젝트 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
