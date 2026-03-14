export const dynamic = 'force-dynamic';

import Link from 'next/link';

import { getDailySlogan } from '@/lib/ai/daily-slogan';
import { db } from '@/lib/db';
import { listProjects } from '@/lib/db/queries/projects';

import { CreateProjectForm } from './create-project-form';

export default async function ProjectListPage() {
  const projects = await listProjects(db);
  const slogan = await Promise.race([
    getDailySlogan(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">소설 목록</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            나의 소설 프로젝트를 관리하세요
          </p>
        </div>
        <CreateProjectForm />
      </div>

      {slogan ? (
        <div className="rounded-lg border border-border bg-muted/40 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            오늘의 창작 슬로건
          </p>
          <p className="mt-1.5 text-sm italic text-foreground/80">{slogan}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-5 py-4">
          <p className="text-xs text-muted-foreground">
            AI 슬로건 미연결 —{' '}
            <span className="font-mono">.env.local</span>에{' '}
            <span className="font-mono">OPENAI_API_KEY</span> 등을 설정하면 매일 창작 슬로건이
            표시됩니다
          </p>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <p className="text-lg font-medium text-muted-foreground">아직 소설이 없습니다</p>
          <p className="mt-1 text-sm text-muted-foreground">
            &quot;새 소설&quot; 버튼을 눌러 첫 소설을 시작하세요
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-accent/50"
              href={`/projects/${project.id}`}
            >
              <h2 className="font-semibold text-card-foreground group-hover:text-foreground">
                {project.title}
              </h2>
              {project.genre && (
                <span className="mt-2 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                  {project.genre}
                </span>
              )}
              {project.synopsis && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {project.synopsis}
                </p>
              )}
              {project.createdAt && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {project.createdAt.toLocaleDateString('ko-KR')}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
