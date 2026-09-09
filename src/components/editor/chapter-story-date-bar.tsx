'use client';

import { CalendarClock, Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getStoryCalendar, type StoryDatePrecision } from '@/lib/story-timeline';

export type ChapterStoryDate = {
  id: string;
  storyYear: number | null;
  storyMonth: number | null;
  storyDay: number | null;
  storyTimeLabel: string | null;
  storyDatePrecision: StoryDatePrecision;
  storyDateLabel: string | null;
};

export function ChapterStoryDateBar({
  chapter,
  projectId,
  settingsJson,
  onChange,
}: {
  chapter: ChapterStoryDate;
  projectId: string;
  settingsJson: string | null;
  onChange: (chapter: ChapterStoryDate) => void;
}) {
  const calendar = getStoryCalendar(settingsJson);
  const [precision, setPrecision] = useState<StoryDatePrecision>(chapter.storyDatePrecision ?? 'none');
  const [year, setYear] = useState(chapter.storyYear ? String(chapter.storyYear) : '');
  const [month, setMonth] = useState(chapter.storyMonth ? String(chapter.storyMonth) : '');
  const [day, setDay] = useState(chapter.storyDay ? String(chapter.storyDay) : '');
  const [timeLabel, setTimeLabel] = useState(chapter.storyTimeLabel ?? '');
  const [relativeLabel, setRelativeLabel] = useState(chapter.storyDateLabel ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPrecision(chapter.storyDatePrecision ?? 'none');
    setYear(chapter.storyYear ? String(chapter.storyYear) : '');
    setMonth(chapter.storyMonth ? String(chapter.storyMonth) : '');
    setDay(chapter.storyDay ? String(chapter.storyDay) : '');
    setTimeLabel(chapter.storyTimeLabel ?? '');
    setRelativeLabel(chapter.storyDateLabel ?? '');
    setMessage('');
  }, [chapter]);

  const numberOrNull = (value: string) => value ? Number.parseInt(value, 10) : null;
  const save = async () => {
    setSaving(true); setMessage('');
    const payload = {
      storyDatePrecision: precision,
      storyYear: ['year', 'month', 'day', 'time'].includes(precision) ? numberOrNull(year) : null,
      storyMonth: ['month', 'day', 'time'].includes(precision) ? numberOrNull(month) : null,
      storyDay: ['day', 'time'].includes(precision) ? numberOrNull(day) : null,
      storyTimeLabel: precision === 'time' ? timeLabel.trim() || null : null,
      storyDateLabel: precision === 'relative' ? relativeLabel.trim() || null : null,
    };
    try {
      const response = await fetch(`/api/projects/${projectId}/chapters/${chapter.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '작품 시간을 저장하지 못했습니다.');
      onChange(result); setMessage('작품 시간을 저장했습니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '작품 시간을 저장하지 못했습니다.'); }
    finally { setSaving(false); }
  };

  const inputClass = 'h-8 rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring';
  return <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/45 px-5 py-2.5 sm:px-7">
    <span className="flex items-center gap-1.5 text-xs font-semibold"><CalendarClock className="size-3.5 text-primary" />작품 시간</span>
    <select aria-label="작품 시간 정확도" className={inputClass} value={precision} onChange={event => setPrecision(event.target.value as StoryDatePrecision)}>
      <option value="none">미정</option><option value="year">연도</option><option value="month">연·월</option><option value="day">연·월·일</option><option value="time">날짜·시간</option><option value="relative">상대 시점</option>
    </select>
    {['year', 'month', 'day', 'time'].includes(precision) && <><span className="text-xs text-muted-foreground">{calendar.era}</span><input aria-label="작품 연도" className={`${inputClass} w-20`} min={1} max={1_000_000} onChange={event => setYear(event.target.value)} placeholder="연" type="number" value={year} /></>}
    {['month', 'day', 'time'].includes(precision) && <input aria-label="작품 월" className={`${inputClass} w-16`} min={1} max={calendar.monthsPerYear} onChange={event => setMonth(event.target.value)} placeholder="월" type="number" value={month} />}
    {['day', 'time'].includes(precision) && <input aria-label="작품 일" className={`${inputClass} w-16`} min={1} max={calendar.daysPerMonth} onChange={event => setDay(event.target.value)} placeholder="일" type="number" value={day} />}
    {precision === 'time' && <><input aria-label="작품 시간 명칭" className={`${inputClass} w-28`} list="story-time-labels" maxLength={80} onChange={event => setTimeLabel(event.target.value)} placeholder="예: 묘시" value={timeLabel} /><datalist id="story-time-labels">{calendar.timeLabels.map(label => <option key={label} value={label} />)}</datalist></>}
    {precision === 'relative' && <input aria-label="상대 작품 시점" className={`${inputClass} min-w-40 flex-1`} maxLength={160} onChange={event => setRelativeLabel(event.target.value)} placeholder="예: 이전 사건으로부터 사흘 뒤" value={relativeLabel} />}
    <Button disabled={saving} onClick={() => void save()} size="sm" type="button" variant="ghost">{saving ? <Loader2 className="animate-spin" /> : <Check />}저장</Button>
    {message && <span className="text-xs text-muted-foreground" role="status">{message}</span>}
  </div>;
}
