'use client';

import { Quote } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'muse-novel-daily-slogan';
const FALLBACK_SLOGAN =
  '한 문장을 쓰는 순간, 막막하던 세계가 움직이기 시작합니다.';

interface DailySloganPayload {
  date: string;
  slogan: string;
}

let browserRequest:
  | { date: string; promise: Promise<DailySloganPayload> }
  | undefined;

function getKoreanDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function isPayload(value: unknown): value is DailySloganPayload {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<DailySloganPayload>;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.date ?? '') &&
    typeof candidate.slogan === 'string' &&
    candidate.slogan.trim().length > 0 &&
    candidate.slogan.length <= 240
  );
}

function readCachedSlogan(today: string): DailySloganPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const cached: unknown = JSON.parse(raw);
    return isPayload(cached) && cached.date === today ? cached : null;
  } catch {
    return null;
  }
}

function requestDailySlogan(today: string): Promise<DailySloganPayload> {
  if (browserRequest?.date === today) return browserRequest.promise;

  const promise = fetch(`/api/daily-slogan?date=${encodeURIComponent(today)}`, {
    cache: 'force-cache',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Daily slogan request failed: ${response.status}`);

      const payload: unknown = await response.json();
      if (!isPayload(payload)) throw new Error('Invalid daily slogan response');
      return payload;
    })
    .catch(() => ({ date: today, slogan: FALLBACK_SLOGAN }));

  browserRequest = { date: today, promise };
  return promise;
}

export function DailySloganCard() {
  const [slogan, setSlogan] = useState(FALLBACK_SLOGAN);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const today = getKoreanDateKey();
    const cached = readCachedSlogan(today);

    if (cached) {
      setSlogan(cached.slogan);
      setIsLoading(false);
      return;
    }

    requestDailySlogan(today).then((payload) => {
      if (!active) return;

      setSlogan(payload.slogan);
      setIsLoading(false);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Storage can be disabled; the in-memory request still prevents repeats.
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      aria-busy={isLoading}
      className="muse-panel flex min-h-[4.5rem] items-start gap-4 px-5 py-4 sm:px-6"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Quote className="size-4" />
      </span>
      <div>
        <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          오늘의 창작 문장
        </p>
        <p
          aria-live="polite"
          className="mt-1.5 font-heading text-sm leading-6 text-foreground/85 sm:text-base"
        >
          {slogan}
        </p>
      </div>
    </div>
  );
}
