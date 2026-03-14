export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { listLoras } from '@/lib/db/queries/loras';
import { AISettingsPage } from '@/components/settings/ai-settings-page';
import { LoraSettingsSection } from '@/components/settings/lora-settings-section';
import { Toaster } from 'sonner';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(db, id);
  const loras = await listLoras(db, id);

  return (
    <>
      <Toaster richColors position="top-right" />
      <div className="space-y-10">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold tracking-tight">AI 설정</h1>
          <AISettingsPage projectId={id} />
        </div>
        <hr className="border-border" />
        <LoraSettingsSection
          projectId={id}
          initialLoras={loras}
          activeLoraId={project?.activeLoraId ?? null}
        />
      </div>
    </>
  );
}
