export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { listProjectSummaries } from '@/lib/db/queries/projects';

import { HomeTabShell } from './home-tab-shell';

export default async function ProjectListPage() {
  const projects = await listProjectSummaries(db);

  const serializedProjects = projects.map((p) => ({
    id: p.id,
    title: p.title,
    genre: p.genre,
    synopsis: p.synopsis,
    createdAt: p.createdAt?.toISOString() ?? null,
  }));

  return <HomeTabShell projects={serializedProjects} />;
}
