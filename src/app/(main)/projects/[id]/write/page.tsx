'use client';

import {
  BookOpenText,
  BrainCircuit,
  ClipboardList,
  ClipboardCheck,
  Feather,
  LoaderCircle,
  Map as MapIcon,
  NotebookPen,
  NotebookText,
  Sparkles,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ChapterSidebar } from '@/components/chapter/chapter-sidebar';
import {
  AuthorNotebookSidebar,
  type AuthorNotebookNote,
} from '@/components/editor/author-notebook-sidebar';
import type { AuthorNotebookWorkspaceProps, AuthorNotebookWorkspaceHandle } from '@/components/editor/author-notebook-workspace';
import { AutoSaveIndicator } from '@/components/editor/auto-save-indicator';
import { ChapterReferenceBar } from '@/components/editor/chapter-reference-bar';
import { ChapterStoryDateBar, type ChapterStoryDate } from '@/components/editor/chapter-story-date-bar';
import { SceneWorkbench } from '@/components/editor/scene-workbench';
import type { ScenePlan } from '@/lib/writing-workbench';
import type { ChapterCloseoutPanelProps } from '@/components/editor/chapter-closeout-panel';
import { isGhostProviderType, isLocalGhostBaseUrl } from '@/lib/ai/ghost-provider-policy';
import type {
  PlateEditorHandle,
  PlateEditorProps,
} from '@/components/editor/plate-editor';
import type { StoryStatePanelProps } from '@/components/editor/story-state-panel';
import type { WritingIntelligencePanelProps } from '@/components/editor/writing-intelligence-panel';
import type { WritingReferencePanelProps } from '@/components/editor/writing-reference-panel';
import { Button } from '@/components/ui/button';
import { useAutoSave } from '@/hooks/use-auto-save';
import {
  getWritingBlueprint,
  updateWritingBlueprintSettings,
} from '@/lib/ai/writing-blueprint';
import {
  clearDraftOutboxIfMatching,
  readDraftOutbox,
} from '@/lib/client/draft-outbox';

const PlateEditor = dynamic<PlateEditorProps>(
  () =>
    import('@/components/editor/plate-editor').then((module) => module.PlateEditor),
  {
    loading: () => <EditorLoadingPlaceholder />,
    ssr: false,
  }
);

const WritingIntelligencePanel = dynamic<WritingIntelligencePanelProps>(
  () =>
    import('@/components/editor/writing-intelligence-panel').then(
      (module) => module.WritingIntelligencePanel
    ),
  { ssr: false }
);

const StoryStatePanel = dynamic<StoryStatePanelProps>(
  () =>
    import('@/components/editor/story-state-panel').then(
      (module) => module.StoryStatePanel
    ),
  { ssr: false }
);

const ChapterCloseoutPanel = dynamic<ChapterCloseoutPanelProps>(
  () => import('@/components/editor/chapter-closeout-panel').then(module => module.ChapterCloseoutPanel),
  { ssr: false }
);

const AuthorNotebookWorkspace = dynamic<AuthorNotebookWorkspaceProps>(
  () =>
    import('@/components/editor/author-notebook-workspace').then(
      (module) => module.AuthorNotebookWorkspace
    ),
  { ssr: false }
);

const WritingReferencePanel = dynamic<WritingReferencePanelProps>(
  () => import('@/components/editor/writing-reference-panel').then((module) => module.WritingReferencePanel),
  { ssr: false }
);

interface Chapter extends ChapterStoryDate {
  id: string;
  projectId: string;
  title: string;
  order: number;
  contentJson: string | null;
}

function EditorLoadingPlaceholder() {
  return (
    <div
      aria-live="polite"
      className="flex min-h-[28rem] items-center justify-center"
      role="status"
    >
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        편집기를 불러오는 중입니다.
      </div>
    </div>
  );
}

export default function WritePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const editorRef = useRef<PlateEditorHandle>(null);
  const notebookRef = useRef<AuthorNotebookWorkspaceHandle>(null);
  const latestContentRef = useRef('');
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [showSceneWorkbench, setShowSceneWorkbench] = useState(false);
  const [examplesOnly, setExamplesOnly] = useState(false);
  const [sceneProposal, setSceneProposal] = useState<{ sceneId: string; revision: number; plan: ScenePlan; reason: string } | null>(null);
  const [selectedAuthorNote, setSelectedAuthorNote] =
    useState<AuthorNotebookNote | null>(null);
  const [notebookRefreshToken, setNotebookRefreshToken] = useState(0);
  const [textStats, setTextStats] = useState({ characterCount: 0, byteSize: 0 });
  const [projectSettingsJson, setProjectSettingsJson] = useState<string | null>(null);
  const [projectSettingsLoaded, setProjectSettingsLoaded] = useState(false);
  const [authorNote, setAuthorNote] = useState('');
  const [isAuthorNoteOpen, setIsAuthorNoteOpen] = useState(false);
  const [isIntelligenceOpen, setIsIntelligenceOpen] = useState(false);
  const [isStoryStateOpen, setIsStoryStateOpen] = useState(false);
  const [isCloseoutOpen, setIsCloseoutOpen] = useState(false);
  const [ghostTextEnabled, setGhostTextEnabled] = useState(true);
  const [ghostProviderConfigured, setGhostProviderConfigured] = useState<boolean | null>(null);
  const [ruledLines, setRuledLines] = useState(true);
  const [isMapReferenceOpen, setIsMapReferenceOpen] = useState(false);
  const [isWorldReferenceOpen, setIsWorldReferenceOpen] = useState(false);
  const [authorNoteStatus, setAuthorNoteStatus] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setProjectSettingsLoaded(false);
    fetch(`/api/projects/${params.id}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((project: { settingsJson?: string | null } | null) => {
        if (!project) return;
        const settingsJson = project.settingsJson ?? null;
        setProjectSettingsJson(settingsJson);
        setAuthorNote(getWritingBlueprint(settingsJson).authorNote ?? '');
        setProjectSettingsLoaded(true);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setAuthorNoteStatus('작가 노트를 불러오지 못했습니다.');
      });

    return () => controller.abort();
  }, [params.id]);

  useEffect(() => {
    try { setGhostTextEnabled(localStorage.getItem(`muse-ghost-text:${params.id}`) !== 'off'); }
    catch { setGhostTextEnabled(true); }
  }, [params.id]);

  useEffect(() => {
    const controller = new AbortController();
    setGhostProviderConfigured(null);
    void fetch(`/api/projects/${params.id}/ghost-ai-settings`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (controller.signal.aborted) return;
        const override = data?.override;
        setGhostProviderConfigured(Boolean(
          override && isGhostProviderType(override.providerType) &&
          override.baseUrl && isLocalGhostBaseUrl(override.baseUrl)
        ));
      })
      .catch(() => { if (!controller.signal.aborted) setGhostProviderConfigured(false); });
    return () => controller.abort();
  }, [params.id]);

  useEffect(() => {
    try { setRuledLines(localStorage.getItem(`muse-ruled-lines:${params.id}`) !== 'off'); }
    catch { setRuledLines(true); }
  }, [params.id]);

  const autoSave = useAutoSave({
    projectId: params.id,
    chapterId: selectedChapter?.id ?? '',
    enabled: selectedChapter !== null,
  });

  const handleContentChange = (content: string) => {
    latestContentRef.current = content;
    autoSave.save(content);
  };

  const handleSelectChapter = async (chapter: Chapter | null) => {
    if (selectedAuthorNote && notebookRef.current && !await notebookRef.current.flushSave()) return;
    if (chapter?.id !== selectedChapter?.id) { setSceneId(null); setSceneProposal(null); }
    setSelectedAuthorNote(null);
    // Finish worker serialization before flushing the current chapter save.
    if (selectedChapter) {
      await editorRef.current?.flushProcessing();
      autoSave.flush();
    }

    if (!chapter) {
      latestContentRef.current = '';
      setSelectedChapter(null);
      setTextStats({ characterCount: 0, byteSize: 0 });
      return;
    }

    // Fetch full chapter data to get contentJson
    const res = await fetch(
      `/api/projects/${params.id}/chapters/${chapter.id}`
    );

    if (res.ok) {
      const fullChapter: Chapter = await res.json();
      latestContentRef.current = fullChapter.contentJson ?? '';

      // Prefer the asynchronous IndexedDB outbox and transparently fall back
      // to the legacy localStorage backup on restricted browsers.
      const pendingDraft = await readDraftOutbox(params.id, chapter.id);
      const backup = pendingDraft?.content ?? null;

      if (backup && backup !== fullChapter.contentJson) {
        const restore = window.confirm(
          '저장되지 않은 변경사항이 있습니다. 복원하시겠습니까?'
        );

        if (restore) {
          latestContentRef.current = backup;
          setTextStats({ characterCount: 0, byteSize: 0 });
          setSelectedChapter({ ...fullChapter, contentJson: backup });
        } else {
          await clearDraftOutboxIfMatching(params.id, chapter.id, backup);
          setTextStats({ characterCount: 0, byteSize: 0 });
          setSelectedChapter(fullChapter);
        }
      } else {
        setTextStats({ characterCount: 0, byteSize: 0 });
        setSelectedChapter(fullChapter);
      }
    }
  };

  const handleSelectAuthorNote = async (note: AuthorNotebookNote | null) => {
    if (note && selectedAuthorNote && notebookRef.current && !await notebookRef.current.flushSave()) return;
    if (selectedChapter) {
      await editorRef.current?.flushProcessing();
      autoSave.flush();
    }
    setSelectedAuthorNote(note);
  };

  const handleRetry = () => {
    autoSave.retry();
  };

  const handleSaveAuthorNote = async () => {
    if (!projectSettingsLoaded) return;
    setAuthorNoteStatus('저장 중...');
    const settingsJson = updateWritingBlueprintSettings(projectSettingsJson, {
      authorNote,
    });

    try {
      const response = await fetch(`/api/projects/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settingsJson }),
      });
      if (!response.ok) throw new Error('save_failed');
      setProjectSettingsJson(settingsJson);
      setAuthorNoteStatus('저장됨');
    } catch {
      setAuthorNoteStatus('저장하지 못했습니다.');
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-12rem)] gap-5 lg:relative lg:left-1/2 lg:w-[calc(100vw-4rem)] lg:max-w-[118rem] lg:-translate-x-1/2 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4 self-start lg:sticky lg:top-[6.5rem] lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-y-auto">
        <AuthorNotebookSidebar
          onOpenExamples={async () => {
            if (selectedAuthorNote && notebookRef.current && !await notebookRef.current.flushSave()) return;
            setSelectedAuthorNote(null); setExamplesOnly(true); setShowSceneWorkbench(true);
          }}
          onSelectNote={handleSelectAuthorNote}
          projectId={params.id}
          refreshToken={notebookRefreshToken}
          selectedNoteId={selectedAuthorNote?.id ?? null}
        />
        <ChapterSidebar
          active={!selectedAuthorNote}
          onSelectChapter={handleSelectChapter}
          selectedChapterId={selectedChapter?.id ?? null}
        />
      </aside>
      <div className="min-w-0">
        <div className="flex h-full flex-col">
          <h1 className="sr-only">소설 작성</h1>
          {selectedAuthorNote ? (
            <AuthorNotebookWorkspace
              ref={notebookRef}
              key={selectedAuthorNote.id}
              note={selectedAuthorNote}
              onClose={() => setSelectedAuthorNote(null)}
              onNoteUpdated={(updated) => {
                setSelectedAuthorNote(current => current?.id === updated.id ? updated : current);
                setNotebookRefreshToken((value) => value + 1);
              }}
              projectId={params.id}
            />
          ) : selectedChapter ? (
            <section className="muse-panel flex min-h-[calc(100vh-12rem)] flex-col overflow-hidden">
              <header className="flex flex-col justify-between gap-3 border-b border-border/60 bg-card/65 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
                <div className="min-w-0">
                  <p className="muse-eyebrow flex items-center gap-1.5">
                    <Feather className="size-3" />
                    Drafting room
                  </p>
                  <h2 className="mt-1.5 truncate font-heading text-lg font-semibold tracking-[-0.02em] sm:text-xl">
                    {selectedChapter.title || '제목 없는 챕터'}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                  <Button onClick={() => { setExamplesOnly(false); setShowSceneWorkbench(open => !open); }} size="sm" variant={showSceneWorkbench ? 'secondary' : 'outline'}>장면 설계</Button>
                  <Button
                    aria-pressed={isWorldReferenceOpen}
                    onClick={() => setIsWorldReferenceOpen((open) => !open)}
                    size="sm"
                    type="button"
                    variant={isWorldReferenceOpen ? 'secondary' : 'outline'}
                  >
                    <BookOpenText />세계관
                  </Button>
                  <Button
                    aria-pressed={isMapReferenceOpen}
                    onClick={() => setIsMapReferenceOpen((open) => !open)}
                    size="sm"
                    type="button"
                    variant={isMapReferenceOpen ? 'secondary' : 'outline'}
                  >
                    <MapIcon />지도
                  </Button>
                  <Button
                    aria-pressed={ghostProviderConfigured === true && ghostTextEnabled}
                    onClick={() => {
                      if (ghostProviderConfigured !== true) {
                        router.push(`/settings/ai?projectId=${params.id}`);
                        return;
                      }
                      setGhostTextEnabled((enabled) => {
                      const next = !enabled;
                      try { localStorage.setItem(`muse-ghost-text:${params.id}`, next ? 'on' : 'off'); } catch { /* Preference persistence is optional. */ }
                      return next;
                      });
                    }}
                    size="sm"
                    type="button"
                    variant={ghostProviderConfigured === true && ghostTextEnabled ? 'secondary' : 'outline'}
                  >
                    <Sparkles />{ghostProviderConfigured === null
                      ? 'Ghost Text 확인 중'
                      : ghostProviderConfigured
                        ? `Ghost Text ${ghostTextEnabled ? '켜짐' : '꺼짐'}`
                        : 'Ghost Text 설정 필요'}
                  </Button>
                  <Button
                    aria-pressed={ruledLines}
                    onClick={() => setRuledLines((enabled) => {
                      const next = !enabled;
                      try { localStorage.setItem(`muse-ruled-lines:${params.id}`, next ? 'on' : 'off'); } catch { /* Optional display preference. */ }
                      return next;
                    })}
                    size="sm"
                    type="button"
                    variant={ruledLines ? 'secondary' : 'outline'}
                  >
                    <NotebookText />줄노트 {ruledLines ? '켜짐' : '꺼짐'}
                  </Button>
                  <Button
                    onClick={() => setIsIntelligenceOpen((open) => !open)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <BrainCircuit />
                    AI 검토·집필
                  </Button>
                  <Button
                    onClick={() => setIsAuthorNoteOpen((open) => !open)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <NotebookPen />
                    작가 노트
                  </Button>
                  <Button
                    aria-pressed={isStoryStateOpen}
                    onClick={() => setIsStoryStateOpen((open) => !open)}
                    size="sm"
                    type="button"
                    variant={isStoryStateOpen ? 'secondary' : 'outline'}
                  >
                    <ClipboardList />
                    상태 메모
                  </Button>
                  <Button aria-pressed={isCloseoutOpen} onClick={() => setIsCloseoutOpen(open => !open)} size="sm" type="button" variant={isCloseoutOpen ? 'secondary' : 'outline'}><ClipboardCheck />이번 화 마감</Button>
                  <span className="rounded-full border border-border/70 bg-background/55 px-3 py-1.5 tabular-nums">
                    {textStats.characterCount.toLocaleString()}자
                  </span>
                  <AutoSaveIndicator
                    onRetry={handleRetry}
                    status={autoSave.status}
                  />
                </div>
              </header>
              <ChapterReferenceBar chapterId={selectedChapter.id} key={`references:${selectedChapter.id}`} projectId={params.id} />
              <ChapterStoryDateBar chapter={selectedChapter} projectId={params.id} settingsJson={projectSettingsJson}
                onChange={updated => setSelectedChapter(current => current?.id === updated.id ? { ...current, ...updated } : current)} />
              {isCloseoutOpen && <ChapterCloseoutPanel chapterId={selectedChapter.id} projectId={params.id} onClose={() => setIsCloseoutOpen(false)}
                beforeAnalyze={async () => {
                  await editorRef.current?.flushProcessing();
                  const response = await fetch(`/api/projects/${params.id}/chapters/${selectedChapter.id}/content`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentJson: latestContentRef.current }),
                  });
                  return response.ok;
                }} onApplied={chapter => setSelectedChapter(current => current ? { ...current, ...chapter } as Chapter : current)} />}
              {showSceneWorkbench && <SceneWorkbench key={`${selectedChapter.id}:${sceneProposal?.revision ?? 'saved'}`} proposal={sceneProposal} projectId={params.id} chapterId={selectedChapter.id}
                sceneId={sceneId} onSceneChange={setSceneId} examplesOnly={examplesOnly}
                getContent={async () => { await editorRef.current?.flushProcessing(); return latestContentRef.current; }}
                getSelection={() => editorRef.current?.getSelectedText() ?? ''} />}
              {isAuthorNoteOpen && (
                <div className="border-b border-primary/20 bg-primary/4 px-5 py-4 sm:px-7">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label className="muse-field-label" htmlFor="quick-author-note">
                        현재 장면에서 강조할 지침
                      </label>
                      <textarea
                        className="mt-2 min-h-20 w-full resize-y rounded-xl border border-primary/25 bg-card px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                        id="quick-author-note"
                        onChange={(event) => {
                          setAuthorNote(event.target.value);
                          setAuthorNoteStatus('');
                        }}
                        placeholder="예: 범인의 정체는 밝히지 않고, 주인공의 의심만 한 단계 키운다."
                        value={authorNote}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      {authorNoteStatus && (
                        <span className="text-xs text-muted-foreground" role="status">
                          {authorNoteStatus}
                        </span>
                      )}
                      <Button
                        disabled={!projectSettingsLoaded}
                        onClick={handleSaveAuthorNote}
                        size="sm"
                        type="button"
                      >
                        저장
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {isIntelligenceOpen && (
                <WritingIntelligencePanel
                  onSceneProposal={proposal => { setSceneId(proposal.sceneId); setSceneProposal(proposal); setExamplesOnly(false); setShowSceneWorkbench(true); }}
                  sceneId={sceneId}
                  key={selectedChapter.id}
                  chapterId={selectedChapter.id}
                  getCurrentContentJson={async () => {
                    await editorRef.current?.flushProcessing();
                    return latestContentRef.current;
                  }}
                  getCursorContext={() =>
                    editorRef.current?.getCursorContext() ?? {
                      after: '',
                      before: '',
                    }
                  }
                  onApply={(text) => editorRef.current?.insertText(text)}
                  onReplace={(original, replacement) =>
                    editorRef.current?.replaceText(original, replacement) ?? false
                  }
                  projectId={params.id}
                />
              )}
              {isStoryStateOpen && (
                <StoryStatePanel
                  chapterId={selectedChapter.id}
                  chapterOrder={selectedChapter.order}
                  chapterTitle={selectedChapter.title}
                  onClose={() => setIsStoryStateOpen(false)}
                  projectId={params.id}
                />
              )}
              <div className={`min-h-0 flex-1 bg-[color-mix(in_oklab,var(--card)_82%,var(--background))] ${isWorldReferenceOpen || isMapReferenceOpen ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]' : ''} ${isWorldReferenceOpen && isMapReferenceOpen ? '2xl:grid-cols-[minmax(0,1fr)_19rem_19rem]' : ''}`}>
                <div className="min-w-0"><PlateEditor
                    sceneId={sceneId}
                    chapterId={selectedChapter.id}
                    content={selectedChapter.contentJson}
                    ghostTextEnabled={ghostProviderConfigured === true && ghostTextEnabled}
                    ruledLines={ruledLines}
                    key={selectedChapter.id}
                    onStatsChange={setTextStats}
                    onValueChange={handleContentChange}
                    projectId={params.id}
                    ref={editorRef}
                  /></div>
                {(isWorldReferenceOpen || isMapReferenceOpen) && <div className={isWorldReferenceOpen && isMapReferenceOpen ? 'grid min-h-0 grid-rows-2 2xl:contents' : 'contents'}><WritingReferencePanel
                    onCloseMap={() => setIsMapReferenceOpen(false)}
                    onCloseWorld={() => setIsWorldReferenceOpen(false)}
                    projectId={params.id}
                    showMap={isMapReferenceOpen}
                    showWorld={isWorldReferenceOpen}
                  /></div>}
              </div>
              <footer className="flex items-center justify-between gap-4 border-t border-border/50 bg-card/45 px-5 py-2.5 text-[0.66rem] text-muted-foreground sm:px-7">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3" />
                  Ctrl+Alt+Space로 AI 문장 제안
                </span>
                <span className="hidden tabular-nums sm:inline">
                  {textStats.byteSize.toLocaleString()} bytes
                </span>
              </footer>
            </section>
          ) : (
            <div className="muse-empty flex min-h-[34rem] flex-col items-center justify-center">
              <span className="grid size-14 place-items-center rounded-2xl border border-border bg-card text-primary shadow-sm">
                <BookOpenText className="size-6" strokeWidth={1.6} />
              </span>
              <p className="mt-5 font-heading text-xl font-semibold">집필할 챕터를 선택하세요</p>
              <p className="mt-2 max-w-sm text-center text-sm leading-6 text-muted-foreground">
                왼쪽 목차에서 챕터를 고르거나 새 챕터를 만들어 원고를 시작할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
