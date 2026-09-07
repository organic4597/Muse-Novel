export const dynamic = 'force-dynamic';

import { Cpu, PlugZap, Settings2, SlidersHorizontal } from 'lucide-react';
import { Toaster } from 'sonner';

import { AISettingsPage } from '@/components/settings/ai-settings-page';
import { ExternalServiceEndpointForm } from '@/components/settings/external-service-endpoint-form';
import { GlobalAISettingsInline } from '@/components/settings/global-ai-settings-inline';
import { GhostAISettings } from '@/components/settings/ghost-ai-settings';
import { ImageSettingsPage } from '@/components/settings/image-settings-page';
import { LoraSettingsSection } from '@/components/settings/lora-settings-section';
import { ProjectSelector } from '@/components/settings/project-selector';
import { db } from '@/lib/db';
import { type Lora, listLoras } from '@/lib/db/queries/loras';
import { getProject, listProjects } from '@/lib/db/queries/projects';
import { loadWebReferenceSites } from '@/lib/web-research/catalog';

export default async function GlobalAISettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId: rawProjectId } = await searchParams;
  const allProjects = await listProjects(db);
  const webReferenceSites = await loadWebReferenceSites();

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
      <div className="space-y-8">
        <section className="muse-panel relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
          <div className="pointer-events-none absolute -top-20 right-0 size-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <p className="muse-eyebrow flex items-center gap-1.5"><Settings2 className="size-3.5" />Workspace settings</p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">AI 작업 환경</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              사용할 모델과 외부 API를 연결하고, 프로젝트별 창작 환경을 한곳에서 관리하세요.
            </p>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm"><PlugZap className="size-4" /></span>
            <div>
              <h2 className="font-heading text-xl font-semibold">공통 연결</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">스토리 구상과 보조 기능에서 기본으로 사용할 연결입니다.</p>
            </div>
          </div>
          <GlobalAISettingsInline />
          <ExternalServiceEndpointForm
            defaultUrl={process.env.WEB_SEARCH_URL ?? 'http://muse-search:8080'}
            description="SearXNG 검색 API를 연결합니다. 필요한 배경정보를 검색하고 출처를 표시합니다. 검색어는 외부 검색엔진에 전달되며, 원고 전체는 전송하지 않습니다."
            serviceType="web-search"
            title="웹 검색"
          />
          <details className="muse-panel p-5">
            <summary className="cursor-pointer font-semibold">웹 검색 우선 참고처 {webReferenceSites.length}곳</summary>
            <p className="mt-2 text-sm text-muted-foreground">질문에 맞는 참고처를 먼저 검색하고 다른 자료와 비교합니다. 전체 문서를 미리 수집한 목록은 아닙니다.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {webReferenceSites.map((site) => (
                <li className="rounded-xl border border-border p-3 text-sm" key={site.id}>
                  <a className="font-medium text-primary underline underline-offset-2" href={site.url} rel="noopener noreferrer" target="_blank">{site.name}</a>
                  <span className="ml-2 text-xs text-muted-foreground">{site.kind}</span>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{site.note}</p>
                </li>
              ))}
            </ul>
          </details>
          <ExternalServiceEndpointForm
            defaultUrl="http://127.0.0.1:9877"
            description="한국어 설명을 이미지 태그로 변환하는 외부 API입니다. 앱은 서버를 실행하지 않고 HTTP로만 호출합니다."
            serviceType="tag-recommender"
            title="태그 추천 API"
          />
          <ExternalServiceEndpointForm
            defaultUrl="http://127.0.0.1:8081"
            description="OpenAI 호환 /v1/embeddings API입니다. 연결이 끊겨도 키워드 기억 검색은 계속 동작합니다. 모델명은 EMBEDDING_MODEL 환경 변수로 지정할 수 있습니다."
            healthPath="/v1/models"
            serviceType="embedding"
            title="장기 기억 임베딩 API"
          />
        </section>

        {allProjects.length > 0 && resolvedProjectId && (
          <>
            {/* ── Project-scoped section ── */}
            <section className="space-y-8 border-t border-border/60 pt-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm"><SlidersHorizontal className="size-4" /></span>
                  <div>
                  <h2 className="font-heading text-xl font-semibold tracking-tight">
                    프로젝트별 설정
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    선택한 프로젝트에만 적용되는 AI·이미지·LoRA 설정입니다.
                  </p>
                  </div>
                </div>
                <ProjectSelector
                  projects={projectList}
                  selectedProjectId={resolvedProjectId}
                />
              </div>

              <div className="muse-panel space-y-6 p-5 sm:p-7">
                <h3 className="flex items-center gap-2 font-heading text-lg font-semibold"><Cpu className="size-4 text-primary" />AI 설정</h3>
                <AISettingsPage projectId={resolvedProjectId} />
                <GhostAISettings projectId={resolvedProjectId} />
              </div>

              <ExternalServiceEndpointForm
                defaultUrl="http://127.0.0.1:8081"
                description="이 프로젝트에만 적용할 OpenAI 호환 임베딩 API입니다. 비워 두면 공통 연결을 사용합니다."
                healthPath="/v1/models"
                projectId={resolvedProjectId}
                serviceType="embedding"
                title="프로젝트 임베딩 API"
              />

              <hr className="border-border" />
              <ImageSettingsPage projectId={resolvedProjectId} />

              <hr className="border-border" />
              <LoraSettingsSection
                activeLoraId={activeLoraId}
                initialLoras={loras}
                projectId={resolvedProjectId}
              />
            </section>
          </>
        )}
      </div>
    </>
  );
}
