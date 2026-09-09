'use client';

import {
  ArrowLeft,
  BookOpenText,
  CalendarClock,
  Save,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ExportDialog } from '@/components/export/export-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getWritingBlueprint,
  updateWritingBlueprintSettings,
} from '@/lib/ai/writing-blueprint';
import { getStoryCalendar, updateStoryCalendarSettings } from '@/lib/story-timeline';

type Project = {
  id: string;
  title: string;
  genre: string | null;
  synopsis: string | null;
  settingsJson: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export function ProjectEditForm({ project }: { project: Project }) {
  const router = useRouter();
  const initialBlueprint = getWritingBlueprint(project.settingsJson);
  const initialCalendar = getStoryCalendar(project.settingsJson);
  const [title, setTitle] = useState(project.title);
  const [genre, setGenre] = useState(project.genre ?? '');
  const [synopsis, setSynopsis] = useState(project.synopsis ?? '');
  const [targetAudience, setTargetAudience] = useState(
    initialBlueprint.targetAudience ?? ''
  );
  const [storyPromise, setStoryPromise] = useState(
    initialBlueprint.storyPromise ?? ''
  );
  const [pointOfView, setPointOfView] = useState(
    initialBlueprint.pointOfView ?? ''
  );
  const [narrativeTense, setNarrativeTense] = useState(
    initialBlueprint.narrativeTense ?? ''
  );
  const [writingStyle, setWritingStyle] = useState(
    initialBlueprint.writingStyle ?? ''
  );
  const [formatGoal, setFormatGoal] = useState(
    initialBlueprint.formatGoal ?? ''
  );
  const [endingDirection, setEndingDirection] = useState(
    initialBlueprint.endingDirection ?? ''
  );
  const [contentBoundaries, setContentBoundaries] = useState(
    initialBlueprint.contentBoundaries ?? ''
  );
  const [authorNote, setAuthorNote] = useState(
    initialBlueprint.authorNote ?? ''
  );
  const [calendarEra, setCalendarEra] = useState(initialCalendar.era);
  const [monthsPerYear, setMonthsPerYear] = useState(String(initialCalendar.monthsPerYear));
  const [daysPerMonth, setDaysPerMonth] = useState(String(initialCalendar.daysPerMonth));
  const [timeLabels, setTimeLabels] = useState(initialCalendar.timeLabels.join(', '));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    setFeedback('');
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          genre: genre.trim() || null,
          synopsis: synopsis.trim() || null,
          settingsJson: updateStoryCalendarSettings(updateWritingBlueprintSettings(project.settingsJson, {
            authorNote,
            contentBoundaries,
            endingDirection,
            formatGoal,
            narrativeTense,
            pointOfView,
            storyPromise,
            targetAudience,
            writingStyle,
          }), {
            era: calendarEra.trim() || '작품력',
            monthsPerYear: Math.max(1, Math.min(24, Number.parseInt(monthsPerYear, 10) || 12)),
            daysPerMonth: Math.max(1, Math.min(100, Number.parseInt(daysPerMonth, 10) || 30)),
            timeLabels: timeLabels.split(',').map(value => value.trim()).filter(Boolean).slice(0, 24),
          }),
        }),
      });

      if (res.ok) {
        setFeedback('저장되었습니다.');
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFeedback(data?.error ?? '저장하지 못했습니다. 다시 시도해주세요.');
      }
    } catch {
      setFeedback('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('정말로 이 소설을 삭제하시겠습니까?')) return;

    setIsDeleting(true);
    setFeedback('');
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/');
      } else {
        setFeedback('프로젝트를 삭제하지 못했습니다.');
      }
    } catch {
      setFeedback('네트워크 오류로 프로젝트를 삭제하지 못했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="muse-panel relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -top-20 right-0 size-56 rounded-full bg-primary/9 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div>
            <Link
              className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              href="/"
            >
              <ArrowLeft className="size-3.5" />
              내 서재
            </Link>
            <p className="muse-eyebrow">Project studio</p>
            <h1 className="mt-3 max-w-3xl font-heading text-3xl leading-tight font-semibold tracking-[-0.035em] sm:text-4xl">
              {title || '제목 없는 소설'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              작품의 중심 정보를 정리하고 집필에 필요한 방향을 선명하게 만드세요.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportDialog
              projectId={project.id}
              projectTitle={title.trim() || project.title}
            />
            <Button asChild size="lg">
              <Link href={`/projects/${project.id}/write`}>
                <BookOpenText />
                글쓰기 시작
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <form className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]" onSubmit={handleSave}>
        <section className="muse-panel space-y-6 p-5 sm:p-7">
          <div>
            <p className="muse-eyebrow">Manuscript profile</p>
            <h2 className="mt-2 font-heading text-xl font-semibold">작품 정보</h2>
          </div>

          <div className="space-y-2.5">
            <label className="muse-field-label" htmlFor="title">
              제목
            </label>
            <Input
              id="title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="소설 제목"
              required
              value={title}
            />
          </div>

          <div className="space-y-2.5">
            <label className="muse-field-label" htmlFor="genre">
              장르
            </label>
            <Input
              id="genre"
              onChange={(e) => setGenre(e.target.value)}
              placeholder="예: 판타지, 로맨스, SF"
              value={genre}
            />
          </div>

          <div className="space-y-2.5">
            <label className="muse-field-label" htmlFor="synopsis">
              시놉시스
            </label>
            <textarea
              className="min-h-48 w-full resize-y rounded-xl border border-input bg-card/70 px-3.5 py-3 text-sm leading-7 shadow-sm outline-none transition-[background-color,border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/20 dark:bg-input/25"
              id="synopsis"
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="주인공의 목표, 갈등, 세계의 규칙을 자유롭게 기록하세요."
              value={synopsis}
            />
          </div>

          <div className="border-t border-border/70 pt-6">
            <p className="muse-eyebrow">Writing blueprint</p>
            <h2 className="mt-2 font-heading text-xl font-semibold">집필 기본 설정</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              이어쓰기와 Ghost Text가 작품 전체에서 계속 유지할 기준입니다.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2.5">
              <label className="muse-field-label" htmlFor="targetAudience">주요 독자층</label>
              <Input
                id="targetAudience"
                onChange={(event) => setTargetAudience(event.target.value)}
                placeholder="예: 성인 미스터리 독자"
                value={targetAudience}
              />
            </div>
            <div className="space-y-2.5">
              <label className="muse-field-label" htmlFor="formatGoal">분량/형식</label>
              <Input
                id="formatGoal"
                onChange={(event) => setFormatGoal(event.target.value)}
                placeholder="예: 웹소설 120화, 회차당 5천 자"
                value={formatGoal}
              />
            </div>
            <div className="space-y-2.5">
              <label className="muse-field-label" htmlFor="pointOfView">서술 시점</label>
              <Input
                id="pointOfView"
                onChange={(event) => setPointOfView(event.target.value)}
                placeholder="예: 주인공 3인칭 제한"
                value={pointOfView}
              />
            </div>
            <div className="space-y-2.5">
              <label className="muse-field-label" htmlFor="narrativeTense">서술 시제</label>
              <Input
                id="narrativeTense"
                onChange={(event) => setNarrativeTense(event.target.value)}
                placeholder="예: 과거형"
                value={narrativeTense}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="muse-field-label" htmlFor="storyPromise">핵심 재미/감정 약속</label>
            <textarea
              className="min-h-24 w-full resize-y rounded-xl border border-input bg-card/70 px-3.5 py-3 text-sm leading-7 shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              id="storyPromise"
              onChange={(event) => setStoryPromise(event.target.value)}
              placeholder="예: 독자는 단서가 뒤집힐 때마다 기억과 진실을 의심하게 된다."
              value={storyPromise}
            />
          </div>

          <div className="space-y-2.5">
            <label className="muse-field-label" htmlFor="writingStyle">문체 규칙</label>
            <textarea
              className="min-h-28 w-full resize-y rounded-xl border border-input bg-card/70 px-3.5 py-3 text-sm leading-7 shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              id="writingStyle"
              onChange={(event) => setWritingStyle(event.target.value)}
              placeholder="문장 길이, 대사 비율, 감각 묘사와 피할 표현을 적어주세요."
              value={writingStyle}
            />
          </div>

          <div className="space-y-2.5">
            <label className="muse-field-label" htmlFor="endingDirection">결말 방향</label>
            <textarea
              className="min-h-24 w-full resize-y rounded-xl border border-input bg-card/70 px-3.5 py-3 text-sm leading-7 shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              id="endingDirection"
              onChange={(event) => setEndingDirection(event.target.value)}
              placeholder="결말의 상태와 주인공이 치를 대가 또는 변화를 적어주세요."
              value={endingDirection}
            />
          </div>

          <div className="space-y-2.5">
            <label className="muse-field-label" htmlFor="contentBoundaries">소재/수위 경계</label>
            <textarea
              className="min-h-20 w-full resize-y rounded-xl border border-input bg-card/70 px-3.5 py-3 text-sm leading-7 shadow-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              id="contentBoundaries"
              onChange={(event) => setContentBoundaries(event.target.value)}
              placeholder="피할 소재, 묘사 수위 또는 사용하지 않을 표현"
              value={contentBoundaries}
            />
          </div>

          <div className="space-y-2.5">
            <label className="muse-field-label" htmlFor="authorNote">현재 작가 노트</label>
            <textarea
              className="min-h-20 w-full resize-y rounded-xl border border-primary/25 bg-primary/4 px-3.5 py-3 text-sm leading-7 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              id="authorNote"
              onChange={(event) => setAuthorNote(event.target.value)}
              placeholder="예: 이번 장면에서는 범인의 정체를 밝히지 말고 의심만 키운다."
              value={authorNote}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              현재 생성에서 강하게 반영됩니다. 장면의 목적이 바뀌면 짧게 갱신하세요.
            </p>
          </div>

          <div className="border-t border-border/70 pt-6">
            <p className="muse-eyebrow">Story calendar</p>
            <h2 className="mt-2 font-heading text-xl font-semibold">작품 시간</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">회차 상태와 복선·사건 보드에서 사용할 단일 연호와 달력입니다.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2.5"><label className="muse-field-label" htmlFor="calendarEra">연호</label><Input id="calendarEra" maxLength={80} onChange={event => setCalendarEra(event.target.value)} placeholder="예: 천무력" value={calendarEra} /></div>
            <div className="space-y-2.5"><label className="muse-field-label" htmlFor="monthsPerYear">1년의 개월 수</label><Input id="monthsPerYear" min={1} max={24} onChange={event => setMonthsPerYear(event.target.value)} type="number" value={monthsPerYear} /></div>
            <div className="space-y-2.5"><label className="muse-field-label" htmlFor="daysPerMonth">한 달의 일수</label><Input id="daysPerMonth" min={1} max={100} onChange={event => setDaysPerMonth(event.target.value)} type="number" value={daysPerMonth} /></div>
          </div>
          <div className="space-y-2.5"><label className="muse-field-label" htmlFor="timeLabels">시간 명칭</label><Input id="timeLabels" maxLength={500} onChange={event => setTimeLabels(event.target.value)} placeholder="예: 자시, 축시, 인시, 묘시" value={timeLabels} /><p className="text-xs text-muted-foreground">쉼표로 구분합니다. 비워두면 자유 입력만 사용합니다.</p></div>

          {feedback && (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground" role="status">
              {feedback}
            </p>
          )}
        </section>

        <aside className="space-y-5">
          <section className="muse-panel p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="size-4" />
              <h2 className="text-xs font-semibold tracking-[0.12em] uppercase">기록</h2>
            </div>
            {project.createdAt && (
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">생성일</dt>
                  <dd className="mt-1 font-medium">{project.createdAt.toLocaleDateString('ko-KR')}</dd>
                </div>
                {project.updatedAt && (
                  <div>
                    <dt className="text-xs text-muted-foreground">최근 수정</dt>
                    <dd className="mt-1 font-medium">{project.updatedAt.toLocaleDateString('ko-KR')}</dd>
                  </div>
                )}
              </dl>
            )}
            <Button className="mt-6 w-full" disabled={isSaving || !title.trim()} type="submit">
              <Save />
              {isSaving ? '저장 중...' : '변경사항 저장'}
            </Button>
          </section>

          <section className="rounded-2xl border border-destructive/20 bg-destructive/4 p-5">
            <h2 className="text-sm font-semibold">위험 구역</h2>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              프로젝트와 모든 원고 데이터를 영구적으로 삭제합니다.
            </p>
            <Button
              className="mt-4 w-full"
              disabled={isDeleting}
              onClick={handleDelete}
              type="button"
              variant="destructive"
            >
              <Trash2 />
              {isDeleting ? '삭제 중...' : '프로젝트 삭제'}
            </Button>
          </section>
        </aside>
      </form>
    </div>
  );
}
