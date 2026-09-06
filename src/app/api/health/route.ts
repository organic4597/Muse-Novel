import { aiRequestScheduler } from '@/lib/ai/request-scheduler';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Importing the database applies pending local migrations. The read also
    // prevents a container from being marked healthy when its volume is not
    // writable/readable or a migration failed during initialization.
    await Promise.resolve(
      db.select({ id: projects.id }).from(projects).limit(1).all()
    );

    return Response.json({
      aiQueue: aiRequestScheduler.getMetrics(),
      database: 'ok',
      status: 'ok',
    });
  } catch (error) {
    console.error('[health] database check failed', error);
    return Response.json(
      { database: 'error', status: 'error' },
      { status: 503 }
    );
  }
}
