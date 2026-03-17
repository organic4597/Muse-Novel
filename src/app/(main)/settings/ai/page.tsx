export const dynamic = 'force-dynamic';

import { Toaster } from 'sonner';

import { AISettingsPage } from '@/components/settings/ai-settings-page';
import { GlobalAISettingsInline } from '@/components/settings/global-ai-settings-inline';
import { ImageSettingsPage } from '@/components/settings/image-settings-page';
import { LoraSettingsSection } from '@/components/settings/lora-settings-section';
import { ProjectSelector } from '@/components/settings/project-selector';
import { db } from '@/lib/db';
import { type Lora, listLoras } from '@/lib/db/queries/loras';
import { getProject, listProjects } from '@/lib/db/queries/projects';

export default async function GlobalAISettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId: rawProjectId } = await searchParams;
  const allProjects = await listProjects(db);

  const resolvedProjectId =
    rawProjectId && allProjects.some((p) => p.id === rawProjectId)
      ? rawProjectId
      : (allProjects[0]?.id ?? null);

  let loras: Lora[] = [];
  let activeLoraId: string | null = null;

  if (resolvedProjectId) {
    const project = await getProject(db, resolvedProjectId);
    loras = await listLoras(db, resolvedProjectId);
    activeLoraId = project?.activeLoraId ?? null;
  }

  const projectList = allProjects.map((p) => ({ id: p.id, title: p.title }));

  return (
    <>
      <Toaster position="top-right" richColors />
      <div className="space-y-10">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold tracking-tight">스토리 구상용 AI 설정</h1>
          <p className="text-sm text-muted-foreground">
            스토리 구상 탭에서 사용할 기본 AI 제공자와 모델을 설정합니다.
          </p>
          <GlobalAISettingsInline />
        </div>

        {allProjects.length > 0 && resolvedProjectId && (
          <>
            <hr className="border-border" />

            {/* ── Project-scoped section ── */}
            <div className="space-y-8">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    프로젝트별 설정
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    선택한 프로젝트에만 적용되는 AI·이미지·LoRA 설정입니다.
                  </p>
                </div>
                <ProjectSelector
                  projects={projectList}
                  selectedProjectId={resolvedProjectId}
                />
              </div>

              <div className="space-y-6">
                <h3 className="text-lg font-medium">AI 설정</h3>
                <AISettingsPage projectId={resolvedProjectId} />
              </div>

              <hr className="border-border" />
              <ImageSettingsPage projectId={resolvedProjectId} />

              <hr className="border-border" />
              <LoraSettingsSection
                activeLoraId={activeLoraId}
                initialLoras={loras}
                projectId={resolvedProjectId}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
