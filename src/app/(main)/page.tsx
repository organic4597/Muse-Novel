export const dynamic = 'force-dynamic';

import { getDailySlogan } from '@/lib/ai/daily-slogan';
import { db } from '@/lib/db';
import { listProjects } from '@/lib/db/queries/projects';

import { HomeTabShell } from './home-tab-shell';

export default async function ProjectListPage() {
  const projects = await listProjects(db);
  const slogan = await Promise.race([
    getDailySlogan(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  const serializedProjects = projects.map((p) => ({
    id: p.id,
    title: p.title,
    genre: p.genre,
    synopsis: p.synopsis,
    createdAt: p.createdAt?.toISOString() ?? null,
  }));

  return <HomeTabShell projects={serializedProjects} slogan={slogan} />;
}
