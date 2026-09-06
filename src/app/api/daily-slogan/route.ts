import {
  DEFAULT_DAILY_SLOGAN,
  getDailySlogan,
  getDailySloganDateKey,
} from '@/lib/ai/daily-slogan';

export const dynamic = 'force-dynamic';

export async function GET() {
  const slogan = (await getDailySlogan()) ?? DEFAULT_DAILY_SLOGAN;

  return Response.json(
    {
      date: getDailySloganDateKey(),
      slogan,
    },
    {
      headers: {
        // The client includes the date in the URL and keeps a matching
        // localStorage copy, so this response can stay private for a day.
        'Cache-Control': 'private, max-age=86400',
      },
    }
  );
}
