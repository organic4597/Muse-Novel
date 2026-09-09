import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  deleteChapter,
  getChapter,
  updateChapter,
} from '@/lib/db/queries/chapters';
import { getProject } from '@/lib/db/queries/projects';
import { getStoryCalendar, STORY_DATE_PRECISIONS } from '@/lib/story-timeline';

const updateChapterSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    outline: z.string().max(20_000).optional(),
    summary: z.string().max(20_000).optional(),
    memo: z.string().max(20_000).optional(),
    wordCount: z.number().int().min(0).optional(),
    storyYear: z.number().int().min(1).max(1_000_000).nullable().optional(),
    storyMonth: z.number().int().min(1).max(24).nullable().optional(),
    storyDay: z.number().int().min(1).max(100).nullable().optional(),
    storyTimeLabel: z.string().trim().max(80).nullable().optional(),
    storyDatePrecision: z.enum(STORY_DATE_PRECISIONS).optional(),
    storyDateLabel: z.string().trim().max(160).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const precision = value.storyDatePrecision;
    if (!precision) return;
    if (['year', 'month', 'day', 'time'].includes(precision) && !value.storyYear) context.addIssue({ code: 'custom', message: '작품 연도가 필요합니다.' });
    if (['month', 'day', 'time'].includes(precision) && !value.storyMonth) context.addIssue({ code: 'custom', message: '작품 월이 필요합니다.' });
    if (['day', 'time'].includes(precision) && !value.storyDay) context.addIssue({ code: 'custom', message: '작품 일이 필요합니다.' });
    if (precision === 'relative' && !value.storyDateLabel) context.addIssue({ code: 'custom', message: '상대 시점 설명이 필요합니다.' });
  });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id, chapterId } = await params;
  const chapter = await getChapter(db, chapterId);

  if (!chapter || chapter.projectId !== id) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(chapter);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id, chapterId } = await params;
  const existing = await getChapter(db, chapterId);
  if (!existing || existing.projectId !== id) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const parsed = updateChapterSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: '챕터 정보 형식이 올바르지 않습니다.' },
      { status: 400 }
    );
  }
  const project = await getProject(db, id);
  const calendar = getStoryCalendar(project?.settingsJson);
  if ((parsed.data.storyMonth && parsed.data.storyMonth > calendar.monthsPerYear) ||
    (parsed.data.storyDay && parsed.data.storyDay > calendar.daysPerMonth)) {
    return NextResponse.json({ error: '프로젝트 달력의 월·일 범위를 확인해주세요.' }, { status: 400 });
  }

  const updated = await updateChapter(db, chapterId, {
    title: parsed.data.title,
    outline: parsed.data.outline,
    summary: parsed.data.summary,
    memo: parsed.data.memo,
    wordCount: parsed.data.wordCount,
    storyYear: parsed.data.storyYear,
    storyMonth: parsed.data.storyMonth,
    storyDay: parsed.data.storyDay,
    storyTimeLabel: parsed.data.storyTimeLabel,
    storyDatePrecision: parsed.data.storyDatePrecision,
    storyDateLabel: parsed.data.storyDateLabel,
  });

  if (!updated) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id, chapterId } = await params;
  const existing = await getChapter(db, chapterId);

  if (!existing || existing.projectId !== id) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  await deleteChapter(db, chapterId);

  return new NextResponse(null, { status: 204 });
}
