import { describe, expect, it } from 'vitest';
import { formatStoryDate, getStoryCalendar, storyDateOrder, updateStoryCalendarSettings } from './story-timeline';

describe('story timeline', () => {
  it('preserves other project settings while storing one simple fictional calendar', () => {
    const json = updateStoryCalendarSettings('{"writingBlueprint":{"tone":"절제"}}', {
      era: '천무력', monthsPerYear: 12, daysPerMonth: 30, timeLabels: ['묘시'],
    });
    expect(JSON.parse(json)).toMatchObject({ writingBlueprint: { tone: '절제' }, storyCalendar: { era: '천무력' } });
    expect(getStoryCalendar(json).timeLabels).toEqual(['묘시']);
  });

  it('formats precision without inventing missing month or day values', () => {
    const calendar = { era: '천무력', monthsPerYear: 12, daysPerMonth: 30, timeLabels: ['묘시'] };
    expect(formatStoryDate(calendar, { storyYear: 138, storyMonth: 4, storyDatePrecision: 'month' })).toBe('천무력 138년 4월');
    expect(formatStoryDate(calendar, { storyDatePrecision: 'relative', storyDateLabel: '사흘 뒤' })).toBe('사흘 뒤');
    expect(storyDateOrder({ storyYear: 2, storyMonth: 1, storyDay: 1 }, calendar)).toBe(360);
  });
});
