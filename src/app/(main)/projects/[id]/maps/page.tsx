import { notFound } from 'next/navigation';
import { MapsWorkspace } from '@/components/maps/maps-workspace';
import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';

export const dynamic = 'force-dynamic';
export default async function MapsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await getProject(db, id)) notFound();
  return <MapsWorkspace key={id} projectId={id} />;
}
