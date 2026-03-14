export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';

import { WorldEntryList } from '@/components/world/world-entry-list';
import { db } from '@/lib/db';
import { listWorldEntries } from '@/lib/db/queries/world-entries';
import { getProject } from '@/lib/db/queries/projects';

export default async function WorldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(db, id);

  if (!project) {
    notFound();
  }

  const entries = await listWorldEntries(db, id);

  return (
    <div className="space-y-6">
      <WorldEntryList entries={entries} projectId={id} />
    </div>
  );
}
