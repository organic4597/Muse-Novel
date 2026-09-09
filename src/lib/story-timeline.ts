import { z } from 'zod';

export const STORY_DATE_PRECISIONS = ['none', 'year', 'month', 'day', 'time', 'relative'] as const;
export type StoryDatePrecision = (typeof STORY_DATE_PRECISIONS)[number];

export const storyCalendarSchema = z.object({
  era: z.string().trim().min(1).max(80).default('작품력'),
  monthsPerYear: z.number().int().min(1).max(24).default(12),
  daysPerMonth: z.number().int().min(1).max(100).default(30),
  timeLabels: z.array(z.string().trim().min(1).max(40)).max(24).default([]),
});
export type StoryCalendar = z.infer<typeof storyCalendarSchema>;

export const DEFAULT_STORY_CALENDAR: StoryCalendar = {
  era: '작품력',
  monthsPerYear: 12,
  daysPerMonth: 30,
  timeLabels: [],
};

type ProjectSettings = Record<string, unknown> & { storyCalendar?: unknown };

function parseSettings(settingsJson: string | null | undefined): ProjectSettings {
  if (!settingsJson) return {};
  try {
    const value: unknown = JSON.parse(settingsJson);
    return value && typeof value === 'object' ? value as ProjectSettings : {};
  } catch { return {}; }
}

export function getStoryCalendar(settingsJson: string | null | undefined): StoryCalendar {
  return storyCalendarSchema.catch(DEFAULT_STORY_CALENDAR).parse(parseSettings(settingsJson).storyCalendar);
}

export function updateStoryCalendarSettings(
  settingsJson: string | null | undefined,
  calendar: StoryCalendar
) {
  const settings = parseSettings(settingsJson);
  return JSON.stringify({ ...settings, storyCalendar: storyCalendarSchema.parse(calendar) });
}

export function formatStoryDate(
  calendar: StoryCalendar,
  moment: {
    storyYear?: number | null;
    storyMonth?: number | null;
    storyDay?: number | null;
    storyTimeLabel?: string | null;
    storyDatePrecision?: StoryDatePrecision | null;
    storyDateLabel?: string | null;
  }
) {
  if (moment.storyDatePrecision === 'relative') return moment.storyDateLabel?.trim() || '상대 시점';
  if (!moment.storyYear || moment.storyDatePrecision === 'none') return moment.storyDateLabel?.trim() || '시점 미정';
  const parts = [`${calendar.era} ${moment.storyYear}년`];
  if (moment.storyMonth && ['month', 'day', 'time'].includes(moment.storyDatePrecision ?? '')) parts.push(`${moment.storyMonth}월`);
  if (moment.storyDay && ['day', 'time'].includes(moment.storyDatePrecision ?? '')) parts.push(`${moment.storyDay}일`);
  if (moment.storyTimeLabel && moment.storyDatePrecision === 'time') parts.push(moment.storyTimeLabel);
  return parts.join(' ');
}

export function storyDateOrder(moment: {
  storyYear?: number | null;
  storyMonth?: number | null;
  storyDay?: number | null;
}, calendar: StoryCalendar) {
  if (!moment.storyYear) return null;
  return ((moment.storyYear - 1) * calendar.monthsPerYear + ((moment.storyMonth ?? 1) - 1))
    * calendar.daysPerMonth + ((moment.storyDay ?? 1) - 1);
}
