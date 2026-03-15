export const dynamic = 'force-dynamic';

import { Toaster } from 'sonner';
import { AISettingsPage } from '@/components/settings/ai-settings-page';
import { ImageSettingsPage } from '@/components/settings/image-settings-page';
import { LoraSettingsSection } from '@/components/settings/lora-settings-section';
import { db } from '@/lib/db';
import { listLoras } from '@/lib/db/queries/loras';
import { getProject } from '@/lib/db/queries/projects';

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
      <Toaster position="top-right" richColors />
      <div className="space-y-10">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold tracking-tight">AI 설정</h1>
          <AISettingsPage projectId={id} />
        </div>
        <hr className="border-border" />
        <ImageSettingsPage projectId={id} />
        <hr className="border-border" />
        <LoraSettingsSection
          activeLoraId={project?.activeLoraId ?? null}
          initialLoras={loras}
          projectId={id}
        />
      </div>
    </>
  );
}
