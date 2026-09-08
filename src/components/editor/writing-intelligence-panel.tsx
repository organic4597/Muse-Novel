'use client';

import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  FileSearch2,
  Loader2,
  Play,
  RefreshCw,
  Square,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { WebResearchSources, WebSearchControl } from '@/components/ai/web-research-controls';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { readLongTask } from '@/lib/client/long-task';
import { EDIT_LABELS, type EditDiagnosis, type ScenePlan } from '@/lib/writing-workbench';
import type {
  ManuscriptCriticIntensity,
  ManuscriptCriticReport,
  ManuscriptCriticSceneNote,
  ManuscriptCriticSuggestion,
} from '@/lib/ai/manuscript-critic';
import type { WebResearch, WebSearchMode } from '@/lib/web-research/types';

type Finding = {
  category: string;
  confidence: number;
  description: string;
  evidence: Array<{ quote: string; sourceId: string; sourceTitle: string }>;
  severity: 'info' | 'warning' | 'error';
  suggestion: string;
  title: string;
};

type ProgressStage = 'memory' | 'plan' | 'draft' | 'critique' | 'revise';

const STAGE_LABELS: Record<ProgressStage, string> = {
  critique: '비평',
  draft: '초안',
  memory: '자료 검색',
  plan: '장면 계획',
  revise: '최종 수정',
};

const CATEGORY_LABELS: Record<string, string> = {
  character: '인물',
  item: '소지품',
  relationship: '관계',
  style: '문체',
  timeline: '시간선',
  world_rule: '세계 규칙',
};

const CRITIC_CATEGORY_LABELS: Record<string, string> = {
  awkwardness: '어색한 표현',
  clarity: '명료성',
  dialogue: '대사',
  emotional_logic: '감정 인과',
  exposition: '설명 과잉',
  imagery: '이미지·감각',
  pacing: '장면 속도',
  redundancy: '중복',
  rhythm: '문장 리듬',
  scene_focus: '장면 초점',
  specificity: '구체성',
  subtext: '서브텍스트',
  viewpoint: '시점',
  voice: '인물 목소리',
};

const CRITIC_SCOPE_LABELS: Record<string, string> = {
  paragraph: '문단 리라이트',
  phrase: '구절 수정',
  sentence: '문장 리라이트',
};

const CRITIC_SCENE_LABELS: Record<string, string> = {
  character_voice: '인물 목소리',
  emotional_logic: '감정 인과',
  exposition: '정보 전달',
  pacing: '장면 속도',
  scene_focus: '장면 초점',
  tension: '긴장감',
};

export type WritingIntelligencePanelProps = {
  onSceneProposal?: (proposal: { sceneId: string; revision: number; plan: ScenePlan; reason: string }) => void;
  sceneId?: string | null;
  chapterId: string;
  getCurrentContentJson: () => Promise<string> | string;
  getCursorContext?: () => { before: string; after: string };
  onApply: (text: string) => void;
  onReplace: (original: string, replacement: string) => boolean;
  projectId: string;
};

type SSEHandler = (event: string, data: Record<string, unknown>) => void;

export async function consumeSSE(
  response: Response,
  onEvent: SSEHandler
) {
  if (!response.body) throw new Error('스트리밍 응답을 읽을 수 없습니다.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/u);
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of block.split(/\r?\n/u)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) continue;
        onEvent(
          event,
          JSON.parse(dataLines.join('\n')) as Record<string, unknown>
        );
      }
      if (done) break;
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function WritingIntelligencePanel({
  sceneId,
  onSceneProposal,
  chapterId,
  getCurrentContentJson,
  getCursorContext,
  onApply,
  onReplace,
  projectId,
}: WritingIntelligencePanelProps) {
  const [instruction, setInstruction] = useState('');
  const [webSearchMode, setWebSearchMode] = useState<WebSearchMode>('auto');
  const [research, setResearch] = useState<WebResearch | undefined>();
  const [targetLength, setTargetLength] = useState('1800');
  const [review, setReview] = useState(true);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<ProgressStage | null>(null);
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState('');
  const [outputComplete, setOutputComplete] = useState(false);
  const [agentDetails, setAgentDetails] = useState<{
    knowledgeMode?: string;
    knowledgeWarning?: string;
    memoryMode?: string;
    memoryWarning?: string;
    plan?: string;
    critique?: string | null;
    sceneProposal?: { sceneId: string; revision: number; plan: ScenePlan; reason: string } | null;
  } | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<{ findings: Finding[]; summary: string } | null>(null);
  const [criticRunning, setCriticRunning] = useState(false);
  const [criticStatus, setCriticStatus] = useState('');
  const [diagnosis, setDiagnosis] = useState<EditDiagnosis | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<number[]>([]);
  const [supplement, setSupplement] = useState('');
  const [saveExamples, setSaveExamples] = useState(false);
  const [writeMode, setWriteMode] = useState<'continue' | 'scene'>('continue');
  const utilityAbortRef = useRef<AbortController | null>(null);
  const [criticIntensity, setCriticIntensity] =
    useState<ManuscriptCriticIntensity>('bold');
  const [criticReport, setCriticReport] = useState<{
    qualityReview?: ManuscriptCriticReport['qualityReview'];
    reviewedChars: number;
    sceneNotes: ManuscriptCriticSceneNote[];
    suggestions: ManuscriptCriticSuggestion[];
    summary: string;
    truncated: boolean;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const targetLengthRef = useRef('1800');
  const pendingOutputRef = useRef('');
  const outputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      utilityAbortRef.current?.abort();
      if (outputTimerRef.current) clearTimeout(outputTimerRef.current);
    },
    []
  );

  const flushOutput = () => {
    outputTimerRef.current = null;
    if (!pendingOutputRef.current) return;
    const addition = pendingOutputRef.current;
    pendingOutputRef.current = '';
    setOutput((value) => value + addition);
  };

  const queueOutput = (text: string) => {
    pendingOutputRef.current += text;
    if (!outputTimerRef.current) {
      outputTimerRef.current = setTimeout(flushOutput, 50);
    }
  };

  const indexMemory = async () => {
    setIndexing(true);
    setIndexStatus('작품 기억을 동기화하는 중...');
    try {
      const response = await fetch(`/api/projects/${projectId}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'index' }),
      });
      const data = (await response.json()) as {
        chunks?: number;
        embeddingAvailable?: boolean;
        embeddingError?: string;
        error?: string;
        skippedSources?: number;
        updatedSources?: number;
      };
      if (!response.ok) throw new Error(data.error ?? '기억을 동기화하지 못했습니다.');
      setIndexStatus(
        `${data.chunks ?? 0}개 기억 조각 · ${data.updatedSources ?? 0}개 갱신 · ${
          data.embeddingAvailable ? '의미 검색 사용' : '키워드 검색 사용'
        }${data.embeddingError ? ` (${data.embeddingError})` : ''}`
      );
    } catch (error) {
      setIndexStatus(error instanceof Error ? error.message : '기억 동기화에 실패했습니다.');
    } finally {
      setIndexing(false);
    }
  };

  const checkConsistency = async () => {
    setChecking(true);
    setReport(null);
    setStatus('작품 전체의 연속성을 검사하는 중...');
    try {
      utilityAbortRef.current = new AbortController();
      const response = await fetch(`/api/projects/${projectId}/consistency`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream' }, signal: utilityAbortRef.current.signal,
      });
      const data = (await readLongTask(response, setStatus)) as {
        error?: string;
        findings?: Finding[];
        summary?: string;
      };
      if (!response.ok) throw new Error(data.error ?? '일관성 검사에 실패했습니다.');
      setReport({ findings: data.findings ?? [], summary: data.summary ?? '' });
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '일관성 검사에 실패했습니다.');
    } finally {
      setChecking(false);
    }
  };

  const runCritic = async () => {
    setCriticRunning(true);
    setCriticReport(null);
    setCriticStatus('이야기 흐름을 검토하고 수정안을 앞뒤 원문과 비교하는 중...');
    try {
      utilityAbortRef.current = new AbortController();
      const currentContentJson = await getCurrentContentJson();
      const response = await fetch(`/api/projects/${projectId}/manuscript-critic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        signal: utilityAbortRef.current.signal,
        body: JSON.stringify({
          sceneId,
          chapterId,
          currentContentJson,
          intensity: criticIntensity,
        }),
      });
      const data = (await readLongTask(response, setCriticStatus)) as {
        error?: string;
        reviewedChars?: number;
        qualityReview?: ManuscriptCriticReport['qualityReview'];
        sceneNotes?: ManuscriptCriticSceneNote[];
        suggestions?: ManuscriptCriticSuggestion[];
        summary?: string;
        truncated?: boolean;
      };
      if (!response.ok) throw new Error(data.error ?? '문장 비평에 실패했습니다.');
      setCriticReport({
        qualityReview: data.qualityReview,
        reviewedChars: data.reviewedChars ?? 0,
        sceneNotes: data.sceneNotes ?? [],
        suggestions: data.suggestions ?? [],
        summary: data.summary ?? '',
        truncated: data.truncated ?? false,
      });
      setCriticStatus('');
    } catch (error) {
      setCriticStatus(
        error instanceof Error ? error.message : '문장 비평에 실패했습니다.'
      );
    } finally {
      setCriticRunning(false);
    }
  };

  const runEditorial = async (action: 'diagnose' | 'rewrite') => {
    setCriticRunning(true); setCriticReport(null); setCriticStatus('원고 확인 중...');
    utilityAbortRef.current = new AbortController();
    try {
      const response = await fetch(`/api/projects/${projectId}/writing-workbench`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, signal: utilityAbortRef.current.signal,
        body: JSON.stringify({ action, chapterId, sceneId, currentContentJson: await getCurrentContentJson(),
          ...(action === 'rewrite' ? { snapshot: diagnosis?.snapshot, goals: selectedGoals.map(index => diagnosis?.goals[index]), supplement } : {}) }),
      });
      if (action === 'diagnose') {
        const result = await readLongTask<EditDiagnosis>(response, setCriticStatus);
        setDiagnosis(result); setSelectedGoals([]); setCriticStatus('필요한 편집 목표를 선택해주세요. 목표 문구도 직접 수정할 수 있습니다.');
      } else {
        const result = await readLongTask<ManuscriptCriticReport>(response, setCriticStatus);
        setCriticReport(result); setCriticStatus('문맥 비교를 통과한 수정안을 검토해주세요.');
      }
    } catch (error) { setCriticStatus(error instanceof Error ? error.message : '작업에 실패했습니다.'); }
    finally { setCriticRunning(false); }
  };

  const storeExample = async (suggestion: ManuscriptCriticSuggestion, verdict: 'accepted' | 'rejected', reason: string) => {
    const response = await fetch(`/api/projects/${projectId}/writing-workbench`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save-example', example: { kind: 'edit', verdict,
        title: `${CRITIC_CATEGORY_LABELS[suggestion.category] ?? '편집'} ${verdict === 'accepted' ? '승인' : '거절'}`, original: suggestion.original,
        replacement: suggestion.replacement, reason } }),
    });
    if (!response.ok) throw new Error('원고 처리는 완료했지만 사례 저장에 실패했습니다.');
  };

  const applyCriticSuggestion = async (
    suggestion: ManuscriptCriticSuggestion,
    index: number
  ) => {
    if (!onReplace(suggestion.original, suggestion.replacement)) {
      setCriticStatus(
        '원문이 이미 바뀌었거나 서식 경계를 걸쳐 있어 자동 교체하지 못했습니다. 다시 비평해주세요.'
      );
      return;
    }
    setCriticReport((current) =>
      current
        ? {
            ...current,
            suggestions: current.suggestions.filter(
              (_item, suggestionIndex) => suggestionIndex !== index
            ),
          }
        : current
    );
    setCriticStatus('제안을 승인해 원고에 반영했습니다.');
    if (saveExamples) {
      try { await storeExample(suggestion, 'accepted', suggestion.reason); setCriticStatus('원고에 반영하고 승인 사례로 저장했습니다.'); }
      catch (error) { setCriticStatus(error instanceof Error ? error.message : '사례 저장 실패'); }
    }
  };

  const runAgent = async () => {
    if (instruction.trim().length < 3) {
      setStatus('작성할 장면이나 수정 방향을 3자 이상 입력해주세요.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setResearch(undefined);
    setOutput('');
    setOutputComplete(false);
    pendingOutputRef.current = '';
    setAgentDetails(null);
    setStage('memory');
    setStatus('작품 기억을 준비하는 중...');
    let receivedDone = false;
    try {
      const [currentContentJson, cursorContext] = await Promise.all([
        getCurrentContentJson(),
        Promise.resolve(getCursorContext?.() ?? { before: '', after: '' }),
      ]);
      const requestedTargetLength = Number.parseInt(targetLengthRef.current, 10);
      const response = await fetch(`/api/projects/${projectId}/writing-agent`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sceneId,
          mode: writeMode,
          chapterId,
          currentContentJson,
          cursorAfter: cursorContext.after,
          cursorBefore: cursorContext.before,
          instruction,
          webSearchMode,
          review,
          targetLength: Number.isFinite(requestedTargetLength)
            ? Math.min(6000, Math.max(300, requestedTargetLength))
            : 1800,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? '집필 에이전트를 시작하지 못했습니다.');
      }

      await consumeSSE(response, (event, data) => {
        if (event === 'progress') {
          setStage(data.stage as ProgressStage);
          setStatus(String(data.message ?? '처리 중...'));
        } else if (event === 'delta') {
          queueOutput(String(data.text ?? ''));
        } else if (event === 'done') {
          receivedDone = true;
          setResearch(data.research as WebResearch | undefined);
          if (outputTimerRef.current) clearTimeout(outputTimerRef.current);
          outputTimerRef.current = null;
          pendingOutputRef.current = '';
          setOutput(String(data.text ?? ''));
          setOutputComplete(true);
          setAgentDetails({
            sceneProposal: data.sceneProposal as { sceneId: string; revision: number; plan: ScenePlan; reason: string } | null,
            critique: typeof data.critique === 'string' ? data.critique : null,
            knowledgeMode: String(data.knowledgeMode ?? ''),
            knowledgeWarning:
              typeof data.knowledgeWarning === 'string'
                ? data.knowledgeWarning
                : undefined,
            memoryMode: String(data.memoryMode ?? ''),
            memoryWarning:
              typeof data.memoryWarning === 'string'
                ? data.memoryWarning
                : undefined,
            plan: typeof data.plan === 'string' ? data.plan : undefined,
          });
          setStatus('완성된 원고를 검토한 뒤 원하는 위치에 적용하세요.');
        } else if (event === 'error') {
          throw new Error(String(data.message ?? '집필 에이전트 실행에 실패했습니다.'));
        }
      });
      if (!receivedDone) {
        throw new Error('응답이 완료되기 전에 연결이 끊겼습니다. 부분 출력은 원고에 적용할 수 없습니다.');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setStatus('집필 작업을 중단했습니다.');
      } else {
        setStatus(error instanceof Error ? error.message : '집필 작업에 실패했습니다.');
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setStage(null);
    }
  };

  return (
    <div className="space-y-5 border-b border-primary/20 bg-primary/4 px-5 py-5 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="muse-eyebrow flex items-center gap-1.5">
            <BrainCircuit className="size-3.5" />
            Story intelligence
          </p>
          <h3 className="mt-1 font-heading text-base font-semibold">
            장기 기억 · 일관성 검사 · 집필 에이전트
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={criticRunning || running || indexing || checking} onClick={() => runEditorial('diagnose')} size="sm">편집 목표 찾기</Button>
          {(criticRunning || checking) && <Button onClick={() => utilityAbortRef.current?.abort()} size="sm" variant="outline">검토 중단</Button>}
          <Button disabled={indexing || running || checking} onClick={indexMemory} size="sm" type="button" variant="outline">
            {indexing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            기억 동기화
          </Button>
          <Button disabled={checking || running || indexing} onClick={checkConsistency} size="sm" type="button" variant="outline">
            {checking ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
            전체 일관성 검사
          </Button>
          <select
            aria-label="비평 강도"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            disabled={criticRunning}
            onChange={(event) =>
              setCriticIntensity(event.target.value as ManuscriptCriticIntensity)
            }
            value={criticIntensity}
          >
            <option value="bold">적극적 리라이트</option>
            <option value="balanced">균형 편집</option>
          </select>
          <Button
            disabled={criticRunning || running || indexing || checking}
            onClick={runCritic}
            size="sm"
            type="button"
            variant="outline"
          >
            {criticRunning ? <Loader2 className="animate-spin" /> : <FileSearch2 />}
            원고 비평
          </Button>
        </div>
      </div>

      {indexStatus && <p className="text-xs leading-5 text-muted-foreground" role="status">{indexStatus}</p>}
      {criticStatus && (
        <p className="text-xs leading-5 text-muted-foreground" role="status">
          {criticRunning && <Loader2 className="mr-1 inline size-3 animate-spin" />}
          {criticStatus}
        </p>
      )}

      {criticReport && (
        <div className="space-y-3 rounded-2xl border border-border bg-card/80 p-4">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={saveExamples} onCheckedChange={value => setSaveExamples(value === true)} />승인·거절 결과를 편집 사례로 저장</label>
          <div>
            <h4 className="flex items-center gap-2 font-semibold">
              <FileSearch2 className="size-4 text-primary" /> 원고 편집 제안
            </h4>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {criticReport.summary}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {criticReport.reviewedChars.toLocaleString()}자 검토
              {criticReport.truncated && ' · 긴 원고이므로 최근 20,000자 범위'}
            </p>
          </div>
          {criticReport.sceneNotes.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {criticReport.sceneNotes.map((note, index) => (
                <article
                  className="rounded-xl border border-primary/15 bg-primary/5 p-3"
                  key={`${note.category}-${index}`}
                >
                  <strong className="text-xs text-primary">
                    {CRITIC_SCENE_LABELS[note.category] ?? note.category}
                  </strong>
                  <p className="mt-1 text-sm leading-6">{note.issue}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    편집 방향: {note.recommendation}
                  </p>
                </article>
              ))}
            </div>
          )}
          {criticReport.suggestions.length === 0 ? (
            <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
              {criticReport.qualityReview?.status === 'unavailable'
                ? '수정안의 문맥 비교를 완료하지 못했습니다. 검토되지 않은 교체안은 표시하지 않습니다. 다시 비평할 수 있습니다.'
                : '앞뒤 문맥과 비교해 원문보다 낫다고 판단한 교체안이 없습니다. 현재 문장을 유지해도 좋습니다.'}
            </p>
          ) : (
            <div className="space-y-3">
              {criticReport.suggestions.map((suggestion, index) => (
                <article
                  className="rounded-xl border border-border/70 bg-background/55 p-3"
                  key={`${suggestion.original}-${index}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      {CRITIC_SCOPE_LABELS[suggestion.scope] ?? suggestion.scope} · {CRITIC_CATEGORY_LABELS[suggestion.category] ?? suggestion.category}
                    </span>
                    <Button
                      onClick={() => applyCriticSuggestion(suggestion, index)}
                      size="sm"
                      type="button"
                    >
                      승인하고 교체
                    </Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                      let reason = suggestion.reason;
                      if (saveExamples) {
                        const response = window.prompt('거절 이유를 적어주세요 (다음 요청에서 참고합니다).', '문체가 맞지 않음');
                        if (response === null) return;
                        reason = response;
                        try { await storeExample(suggestion, 'rejected', reason); }
                        catch (error) { setCriticStatus(error instanceof Error ? error.message : '사례 저장 실패'); return; }
                      }
                      setCriticReport(current => current ? { ...current, suggestions: current.suggestions.filter((_s, i) => i !== index) } : current);
                    }}>거절</Button>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    <div className="rounded-lg bg-destructive/5 p-3">
                      <strong className="text-xs text-muted-foreground">현재 원문</strong>
                      <p className="mt-1 whitespace-pre-wrap leading-6">{suggestion.original}</p>
                    </div>
                    <div className="rounded-lg bg-primary/5 p-3">
                      <strong className="text-xs text-muted-foreground">리라이트 제안</strong>
                      <p className="mt-1 whitespace-pre-wrap leading-6">
                        {suggestion.replacement || '(이 구간 삭제)'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {suggestion.reason}
                  </p>
                  {(suggestion.contextBefore || suggestion.contextAfter) && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-muted-foreground">앞뒤 문맥에 연결해서 보기</summary>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/25 p-3 leading-7">
                        <span className="text-muted-foreground">{suggestion.contextBefore}</span>
                        <mark className="bg-primary/15 text-foreground">{suggestion.replacement}</mark>
                        <span className="text-muted-foreground">{suggestion.contextAfter}</span>
                      </p>
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {diagnosis && <div className="space-y-3 rounded-xl border border-primary/20 bg-card p-4">
        <h4 className="font-semibold">편집 목표 선택</h4><p className="text-sm leading-6">{diagnosis.summary}</p>
        <p className="text-xs text-muted-foreground">{diagnosis.reviewedChars.toLocaleString()}자 검토{diagnosis.truncated ? ' · 최근 20,000자' : ''}</p>
        {diagnosis.goals.map((goal, index) => <div key={`${index}-${goal.original}`} className="rounded-lg border border-border p-3">
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={selectedGoals.includes(index)} disabled={criticRunning || goal.action === 'keep'}
            onCheckedChange={value => setSelectedGoals(current => value ? [...current, index].slice(0, 4) : current.filter(item => item !== index))} />
            <span>{EDIT_LABELS[goal.action]} · {goal.issue}</span></label>
          <select aria-label={`편집 방식 ${index + 1}`} className="my-2 rounded border border-border bg-background p-1 text-sm" disabled={criticRunning} value={goal.action}
            onChange={event => {
              const action = event.target.value as keyof typeof EDIT_LABELS;
              setDiagnosis(current => current ? { ...current, goals: current.goals.map((item, i) => i === index ? { ...item, action } : item) } : current);
              if (action === 'keep') setSelectedGoals(current => current.filter(i => i !== index));
            }}>{Object.entries(EDIT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <blockquote className="my-2 whitespace-pre-wrap border-l-2 border-border pl-3 text-xs leading-6 text-muted-foreground">{goal.original}</blockquote>
          <textarea aria-label={`편집 목표 ${index + 1}`} className="w-full rounded border border-border bg-background p-2 text-sm" value={goal.objective} disabled={criticRunning || goal.action === 'keep'}
            onChange={event => setDiagnosis(current => current ? { ...current, goals: current.goals.map((item, i) => i === index ? { ...item, objective: event.target.value } : item) } : current)} />
        </div>)}
        {selectedGoals.some(index => diagnosis.goals[index]?.action === 'supplement') && <label className="block text-sm">작가가 허용할 보충 사실·연결 내용
          <textarea aria-label="보충할 내용" className="mt-2 w-full rounded border border-border bg-background p-2" value={supplement} onChange={e => setSupplement(e.target.value)} placeholder="새로운 단서가 필요하다면 그 내용을 직접 정해주세요." /></label>}
        <Button disabled={criticRunning || !selectedGoals.length} onClick={() => runEditorial('rewrite')}>선택한 목표로 수정문 생성 ({selectedGoals.length}/4)</Button>
      </div>}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem_auto] lg:items-end">
        <div>
          <select aria-label="작성 방식" className="mb-2 rounded border border-border bg-background p-2 text-sm" value={writeMode} onChange={e => setWriteMode(e.target.value as 'continue' | 'scene')} disabled={running}>
            <option value="continue">현재 커서에서 이어쓰기</option><option value="scene" disabled={!sceneId}>선택한 장면 작성</option>
          </select>
          <WebSearchControl disabled={running} onChange={setWebSearchMode} value={webSearchMode} />
          <label className="muse-field-label" htmlFor="writing-agent-instruction">작성 요청</label>
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
            disabled={running}
            id="writing-agent-instruction"
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="예: 주인공이 장로의 거짓말을 눈치채지만 모른 척하는 대화 장면을 이어 써줘."
            value={instruction}
          />
        </div>
        <div>
          <label className="muse-field-label" htmlFor="writing-agent-length">목표 글자 수</label>
          <Input
            disabled={running}
            id="writing-agent-length"
            max={6000}
            min={300}
            onChange={(event) => {
              targetLengthRef.current = event.target.value;
              setTargetLength(event.target.value);
            }}
            type="number"
            value={targetLength}
          />
        </div>
        {running ? (
          <Button onClick={() => abortRef.current?.abort()} type="button" variant="destructive">
            <Square /> 중단
          </Button>
        ) : (
          <Button onClick={runAgent} type="button">
            <Play /> 에이전트 실행
          </Button>
        )}
      </div>
      <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={review} disabled={running} onCheckedChange={(checked) => setReview(checked === true)} />
        초안 작성 후 비평·수정 단계까지 실행 (고품질 모드)
      </label>

      {status && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          {running || checking ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {stage ? `${STAGE_LABELS[stage]} · ` : ''}{status}
        </div>
      )}

      {output && (
        <div className="space-y-3 rounded-2xl border border-primary/20 bg-card/85 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 font-semibold"><WandSparkles className="size-4 text-primary" />생성 원고</h4>
            <Button disabled={running || !outputComplete} onClick={() => onApply(output)} size="sm" type="button">현재 커서에 삽입</Button>
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm leading-7">{output}</pre>
          <WebResearchSources research={research} />
          {!outputComplete && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              완료 신호를 받지 못한 부분 출력입니다. 안전을 위해 원고 삽입이 잠겨있습니다.
            </p>
          )}
          {agentDetails && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">장면 계획·비평 보기 · 작품 기억 {agentDetails.memoryMode === 'hybrid' ? '의미+키워드' : '키워드'} · 작법 지식 {agentDetails.knowledgeMode === 'semantic' ? '의미' : '키워드'}</summary>
              {(agentDetails.memoryWarning || agentDetails.knowledgeWarning) && (
                <p className="mt-2 text-amber-700 dark:text-amber-400">
                  {[agentDetails.memoryWarning, agentDetails.knowledgeWarning]
                    .filter(Boolean)
                    .join(' ')}
                </p>
              )}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div><strong className="text-foreground">계획</strong><pre className="mt-1 whitespace-pre-wrap font-sans leading-5">{agentDetails.plan}</pre></div>
                {agentDetails.critique && <div><strong className="text-foreground">비평</strong><pre className="mt-1 whitespace-pre-wrap font-sans leading-5">{agentDetails.critique}</pre></div>}
              </div>
            </details>
          )}
          {agentDetails?.sceneProposal && onSceneProposal && <div className="rounded-lg border border-primary/20 p-3 text-sm">
            <p>장면 설계 변경 후보: {agentDetails.sceneProposal.reason}</p>
            <Button size="sm" variant="outline" onClick={() => { if (agentDetails.sceneProposal) onSceneProposal(agentDetails.sceneProposal); }}>설계에서 검토하기</Button>
          </div>}
        </div>
      )}

      {report && (
        <div className="space-y-3 rounded-2xl border border-border bg-card/80 p-4">
          <div className="flex items-start gap-2">
            {report.findings.some((finding) => finding.severity === 'error') ? <AlertCircle className="mt-0.5 size-4 text-destructive" /> : <CheckCircle2 className="mt-0.5 size-4 text-green-600" />}
            <div><h4 className="font-semibold">일관성 검사 결과</h4><p className="mt-1 text-sm leading-6 text-muted-foreground">{report.summary}</p></div>
          </div>
          {report.findings.length === 0 ? (
            <p className="text-sm text-green-700 dark:text-green-400">현재 자료에서 뚜렷한 충돌을 찾지 못했습니다.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {report.findings.map((finding, index) => (
                <article className="rounded-xl border border-border/70 bg-background/50 p-3" key={`${finding.category}-${finding.title}-${index}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={finding.severity === 'error' ? 'font-semibold text-destructive' : finding.severity === 'warning' ? 'font-semibold text-amber-600' : 'font-semibold text-primary'}>{finding.severity === 'error' ? '오류' : finding.severity === 'warning' ? '주의' : '참고'}</span>
                    <span className="text-muted-foreground">{CATEGORY_LABELS[finding.category] ?? finding.category} · 신뢰도 {Math.round(finding.confidence * 100)}%</span>
                  </div>
                  <h5 className="mt-1 font-semibold">{finding.title}</h5>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{finding.description}</p>
                  {finding.evidence.length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{finding.evidence.map((evidence, evidenceIndex) => <li key={`${evidence.sourceId}-${evidenceIndex}`}><strong className="text-foreground">{evidence.sourceTitle}</strong>: “{evidence.quote}”</li>)}</ul>}
                  <p className="mt-2 text-xs leading-5"><strong>수정 제안:</strong> {finding.suggestion}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
