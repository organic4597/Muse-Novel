export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';

import { WorldEntryList } from '@/components/world/world-entry-list';
import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { listWorldCategories } from '@/lib/db/queries/world-categories';
import { listWorldEntriesWithTags } from '@/lib/db/queries/world-entries';

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

  const [entries, categories] = await Promise.all([
    listWorldEntriesWithTags(db, id),
    listWorldCategories(db, id),
  ]);

  return (
    <div className="space-y-6">
      <WorldEntryList categoryRecords={categories} entries={entries} projectId={id} savedCategories={categories.map(({ name }) => name)} />
    </div>
  );
}
