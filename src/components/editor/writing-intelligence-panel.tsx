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
import type { ManuscriptCriticSuggestion } from '@/lib/ai/manuscript-critic';
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
  redundancy: '중복',
  rhythm: '문장 리듬',
  viewpoint: '시점',
};

export type WritingIntelligencePanelProps = {
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
  } | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<{ findings: Finding[]; summary: string } | null>(null);
  const [criticRunning, setCriticRunning] = useState(false);
  const [criticStatus, setCriticStatus] = useState('');
  const [criticReport, setCriticReport] = useState<{
    reviewedChars: number;
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
      const response = await fetch(`/api/projects/${projectId}/consistency`, {
        method: 'POST',
      });
      const data = (await response.json()) as {
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
    setCriticStatus('현재 원고의 문장과 표현을 검토하는 중...');
    try {
      const currentContentJson = await getCurrentContentJson();
      const response = await fetch(`/api/projects/${projectId}/manuscript-critic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, currentContentJson }),
      });
      const data = (await response.json()) as {
        error?: string;
        reviewedChars?: number;
        suggestions?: ManuscriptCriticSuggestion[];
        summary?: string;
        truncated?: boolean;
      };
      if (!response.ok) throw new Error(data.error ?? '문장 비평에 실패했습니다.');
      setCriticReport({
        reviewedChars: data.reviewedChars ?? 0,
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

  const applyCriticSuggestion = (
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
          <Button disabled={indexing || running || checking} onClick={indexMemory} size="sm" type="button" variant="outline">
            {indexing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            기억 동기화
          </Button>
          <Button disabled={checking || running || indexing} onClick={checkConsistency} size="sm" type="button" variant="outline">
            {checking ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
            전체 일관성 검사
          </Button>
          <Button
            disabled={criticRunning || running || indexing || checking}
            onClick={runCritic}
            size="sm"
            type="button"
            variant="outline"
          >
            {criticRunning ? <Loader2 className="animate-spin" /> : <FileSearch2 />}
            문장 비평
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
          <div>
            <h4 className="flex items-center gap-2 font-semibold">
              <FileSearch2 className="size-4 text-primary" /> 문장 비평 제안
            </h4>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {criticReport.summary}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {criticReport.reviewedChars.toLocaleString()}자 검토
              {criticReport.truncated && ' · 긴 원고이므로 최근 20,000자 범위'}
            </p>
          </div>
          {criticReport.suggestions.length === 0 ? (
            <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
              원문으로 검증할 수 있는 수정 제안이 없습니다.
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
                      {CRITIC_CATEGORY_LABELS[suggestion.category] ?? suggestion.category} · 확신 {Math.round(suggestion.confidence * 100)}%
                    </span>
                    <Button
                      onClick={() => applyCriticSuggestion(suggestion, index)}
                      size="sm"
                      type="button"
                    >
                      승인하고 교체
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    <div className="rounded-lg bg-destructive/5 p-3">
                      <strong className="text-xs text-muted-foreground">현재 문장</strong>
                      <p className="mt-1 whitespace-pre-wrap leading-6">{suggestion.original}</p>
                    </div>
                    <div className="rounded-lg bg-primary/5 p-3">
                      <strong className="text-xs text-muted-foreground">개선 제안</strong>
                      <p className="mt-1 whitespace-pre-wrap leading-6">{suggestion.replacement}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {suggestion.reason}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem_auto] lg:items-end">
        <div>
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
