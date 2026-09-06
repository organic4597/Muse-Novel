export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';

import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';

import { ProjectEditForm } from './project-edit-form';

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(db, id);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <ProjectEditForm project={project} />
    </div>
  );
}
