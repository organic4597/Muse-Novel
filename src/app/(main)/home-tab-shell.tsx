'use client';

import {
  ArrowUpRight,
  BookOpenText,
  CalendarDays,
  LibraryBig,
  Lightbulb,
  Search,
  Sparkles,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  DEFAULT_PROGRESSIVE_PAGE_SIZE,
  nextProgressiveCount,
  ProgressiveListControls,
} from '@/components/ui/progressive-list-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { CreateProjectForm } from './create-project-form';
import { DailySloganCard } from './daily-slogan-card';

const StoryPlanningTab = dynamic(
  () => import('./story-planning-tab').then((module) => module.StoryPlanningTab),
  {
    loading: () => (
      <div className="muse-panel grid min-h-64 place-items-center p-8 text-sm text-muted-foreground">
        스토리 구상 도구를 준비하는 중...
      </div>
    ),
  }
);

interface SerializedProject {
  id: string;
  title: string;
  genre: string | null;
  synopsis: string | null;
  createdAt: string | null;
}

interface HomeTabShellProps {
  projects: SerializedProject[];
}

const STORAGE_KEY = 'muse-novel-home-tab';

export function HomeTabShell({ projects }: HomeTabShellProps) {
  const [activeTab, setActiveTab] = useState('projects');
  const [shouldLoadPlanning, setShouldLoadPlanning] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [visibleProjectCount, setVisibleProjectCount] = useState(
    DEFAULT_PROGRESSIVE_PAGE_SIZE
  );
  const deferredProjectQuery = useDeferredValue(projectQuery);
  const filteredProjects = useMemo(() => {
    const query = deferredProjectQuery.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
    if (!query) return projects;

    return projects.filter((project) =>
      [project.title, project.genre, project.synopsis]
        .filter((value): value is string => Boolean(value))
        .some((value) =>
          value.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(query)
        )
    );
  }, [deferredProjectQuery, projects]);
  const visibleProjects = filteredProjects.slice(0, visibleProjectCount);

  // Restore tab from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== 'planning') return;

    const timer = window.setTimeout(() => {
      setShouldLoadPlanning(true);
      setActiveTab('planning');
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setVisibleProjectCount(DEFAULT_PROGRESSIVE_PAGE_SIZE);
  }, [deferredProjectQuery]);

  const handleTabChange = (value: string) => {
    if (value === 'planning') setShouldLoadPlanning(true);
    setActiveTab(value);
    localStorage.setItem(STORAGE_KEY, value);
  };

  return (
    <Tabs className="gap-7" onValueChange={handleTabChange} value={activeTab}>
      <section className="muse-panel relative overflow-hidden px-6 py-7 sm:px-9 sm:py-10 lg:px-12">
        <div className="muse-ambient-primary pointer-events-none absolute -top-28 -right-20 size-72 rounded-full" />
        <div className="muse-ambient-highlight pointer-events-none absolute right-[18%] -bottom-24 size-56 rounded-full" />
        <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="muse-eyebrow flex items-center gap-2">
              <Sparkles className="size-3.5" />
              Your writing desk
            </p>
            <h1 className="muse-display mt-4 max-w-2xl">
              머릿속의 세계를,
              <br className="hidden sm:block" /> 한 편의 이야기로.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              기획부터 인물과 세계관, 원고 집필까지 한 흐름 안에서 이어지는
              조용하고 단단한 창작 공간입니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-border/60 bg-background/85 px-5 py-3">
              <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Library
              </p>
              <p className="mt-1 font-heading text-2xl font-semibold">
                {projects.length.toLocaleString()}
                <span className="ml-1.5 font-sans text-xs font-medium text-muted-foreground">
                  작품
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-center sm:justify-start">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger className="px-4 sm:min-w-36" value="projects">
            <LibraryBig />
            소설 목록
          </TabsTrigger>
          <TabsTrigger className="px-4 sm:min-w-36" value="planning">
            <Lightbulb />
            스토리 구상
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent className="mt-0" value="projects">
        <div className="space-y-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="muse-eyebrow">My library</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                내 서재
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                이어서 집필하거나 새로운 이야기를 시작하세요.
              </p>
            </div>
            <CreateProjectForm />
          </div>

          <DailySloganCard />

          {projects.length > 0 && (
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="소설 검색"
                className="pl-10"
                onChange={(event) => setProjectQuery(event.target.value)}
                placeholder="제목, 장르 또는 줄거리 검색"
                type="search"
                value={projectQuery}
              />
            </div>
          )}

          {projects.length === 0 ? (
            <div className="muse-empty relative overflow-hidden">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-border/70 bg-card text-primary shadow-sm">
                <BookOpenText className="size-6" strokeWidth={1.6} />
              </span>
              <p className="mt-5 font-heading text-xl font-semibold">아직 소설이 없습니다</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                첫 문장은 완벽할 필요가 없습니다. 제목 하나로 새로운 원고를
                시작해 보세요.
              </p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="muse-empty">
              <Search className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-4 font-heading text-lg font-semibold">
                일치하는 소설이 없습니다
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                다른 제목, 장르 또는 줄거리로 검색해 보세요.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleProjects.map((project, index) => (
                <Link
                  className="muse-card muse-render-lazy group relative flex min-h-64 flex-col overflow-hidden p-5 sm:p-6"
                  data-project-card
                  href={`/projects/${project.id}`}
                  key={project.id}
                >
                  <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-primary/55 to-highlight/70" />
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-heading text-xs font-semibold tracking-[0.16em] text-muted-foreground/60">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <h3 className="mt-8 font-heading text-xl leading-snug font-semibold tracking-[-0.025em] text-card-foreground">
                    {project.title}
                  </h3>
                  {project.genre && (
                    <span className="mt-3 w-fit rounded-full border border-primary/15 bg-primary/7 px-2.5 py-1 text-[0.68rem] font-semibold text-primary">
                      {project.genre}
                    </span>
                  )}
                  {project.synopsis && (
                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {project.synopsis}
                    </p>
                  )}
                  {project.createdAt && (
                    <p className="mt-auto flex items-center gap-1.5 pt-6 text-[0.68rem] font-medium text-muted-foreground/75">
                      <CalendarDays className="size-3.5" />
                      {new Date(project.createdAt).toLocaleDateString('ko-KR')}
                    </p>
                  )}
                </Link>
              ))}
              </div>
              <ProgressiveListControls
                onLoadMore={() =>
                  setVisibleProjectCount((current) =>
                    nextProgressiveCount(current, filteredProjects.length)
                  )
                }
                shown={visibleProjects.length}
                total={filteredProjects.length}
              />
            </>
          )}
        </div>
      </TabsContent>

      <TabsContent className="mt-0" value="planning">
        {shouldLoadPlanning ? <StoryPlanningTab /> : null}
      </TabsContent>
    </Tabs>
  );
}
