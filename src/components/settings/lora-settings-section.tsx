'use client';

import { useEffect, useRef, useState } from 'react';

import type { Lora } from '@/lib/db/queries/loras';

type Stage = 'idle' | 'generating' | 'done' | 'cancelled' | 'error';

type ProgressEvent = {
  stage: string;
  progress: number;
  message: string;
  output?: string;
};

type TrainingStatus = {
  running: boolean;
  stage: Stage | 'loading' | 'tokenizing' | 'saving' | 'training';
  progress: number;
  message: string;
  error: string | null;
  logs: string[];
  output: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  trainingPid?: number | null;
  cancelRequestedAt?: string | null;
};

type InferenceStatus = {
  running: boolean;
  lora: { loaded: boolean; adapter_path: string | null };
};

type Props = {
  projectId: string;
  initialLoras: Lora[];
  activeLoraId: string | null;
};

export function LoraSettingsSection({
  projectId,
  initialLoras,
  activeLoraId: initialActiveLoraId,
}: Props) {
  const [loras, setLoras] = useState<Lora[]>(initialLoras);
  const [activeLoraId, setActiveLoraId] = useState<string | null>(
    initialActiveLoraId
  );

  // Inference server status
  const [inferenceStatus, setInferenceStatus] = useState<InferenceStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/ai/inference-status');
        if (res.ok && !cancelled) {
          setInferenceStatus(await res.json() as InferenceStatus);
        }
      } catch {
        if (!cancelled) setInferenceStatus(null);
      }
    }
    poll();
    const id = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Generate form state
  const [loraName, setLoraName] = useState('');
  const [uploadedTexts, setUploadedTexts] = useState<string[]>([]);
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log area
  useEffect(() => {
    if (showLogs && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, showLogs]);

  // Inline rename state
  const [editingLoraId, setEditingLoraId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  function applyTrainingStatus(status: TrainingStatus) {
    if (!status.running && status.stage === 'idle' && status.logs.length === 0) {
      return;
    }
    setStage(
      status.running
        ? 'generating'
        : status.stage === 'done'
          ? 'done'
          : status.stage === 'cancelled'
            ? 'cancelled'
          : status.stage === 'error'
            ? 'error'
            : 'idle'
    );
    setProgress(status.progress);
    setMessage(status.message);
    setError(status.error ?? '');
    setLogs(status.logs);
    if (status.logs.length > 0) {
      setShowLogs(true);
    }
    if (status.startedAt) {
      startTimeRef.current = new Date(status.startedAt).getTime();
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000)));
    }
    if (status.running && !timerRef.current) {
      startTimer();
    }
    if (!status.running) {
      stopTimer();
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function pollTrainingStatus() {
      try {
        const res = await fetch(`/api/projects/${projectId}/lora/training-status`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const status = (await res.json()) as TrainingStatus;
        if (!cancelled) {
          applyTrainingStatus(status);
        }
      } catch {
        // ignore polling errors
      }
    }

    pollTrainingStatus();
    const id = setInterval(pollTrainingStatus, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId]);

  function startTimer() {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const texts: string[] = [];
    const names: string[] = [];
    let loaded = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      names.push(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => {
        texts[i] = ev.target?.result as string;
        loaded++;
        if (loaded === files.length) {
          setUploadedTexts(texts);
          setUploadedFileNames(names);
        }
      };
      reader.readAsText(file, 'utf-8');
    }
  }

  function clearFiles() {
    setUploadedTexts([]);
    setUploadedFileNames([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleGenerate() {
    setStage('generating');
    setProgress(0);
    setMessage('시작 중...');
    setError('');
    setLogs([]);
    setShowLogs(false);
    startTimer();

    try {
      const body: Record<string, unknown> = {
        name: loraName.trim() || undefined,
      };
      if (uploadedTexts.length > 1) {
        body.textContents = uploadedTexts;
        body.textFileNames = uploadedFileNames;
      } else if (uploadedTexts.length === 1) {
        body.textContent = uploadedTexts[0];
        body.textFileNames = uploadedFileNames;
      }

      const res = await fetch(`/api/projects/${projectId}/lora/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as ProgressEvent;
            if (ev.stage === 'error') {
              setStage('error');
              setError(ev.message);
              stopTimer();
              return;
            }
            if (ev.stage === 'log') {
              setLogs((prev) => [...prev, ev.message]);
              continue;
            }
            setProgress(ev.progress);
            setMessage(ev.message);
            if (ev.stage === 'done') {
              setStage('done');
              stopTimer();
              // Refresh loras list
              const lorasRes = await fetch(`/api/projects/${projectId}/loras`);
              if (lorasRes.ok) {
                const updated = (await lorasRes.json()) as Lora[];
                setLoras(updated);
                // Set the last one as active (the freshly created one)
                if (ev.output) {
                  const created = updated.find((item) => item.filePath === ev.output);
                  if (created) {
                    setActiveLoraId(created.id);
                  }
                }
              }
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (e) {
      setStage('error');
      setError(e instanceof Error ? e.message : String(e));
      stopTimer();
    }
  }

  async function handleCancel() {
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/lora/cancel`, {
        method: 'POST',
      });
      if (res.ok) {
        const status = (await res.json()) as TrainingStatus;
        applyTrainingStatus(status);
      }
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleActivate(loraId: string) {
    await fetch(`/api/projects/${projectId}/loras/${loraId}/activate`, {
      method: 'POST',
    });
    setActiveLoraId(loraId);
  }

  async function handleDeactivate() {
    await fetch(`/api/projects/${projectId}/loras/deactivate`, {
      method: 'POST',
    });
    setActiveLoraId(null);
  }

  async function handleDelete(loraId: string) {
    await fetch(`/api/projects/${projectId}/loras/${loraId}`, {
      method: 'DELETE',
    });
    setLoras((prev) => prev.filter((l) => l.id !== loraId));
    if (activeLoraId === loraId) {
      setActiveLoraId(null);
    }
  }

  function startRename(lora: Lora) {
    setEditingLoraId(lora.id);
    setEditingName(lora.name);
  }

  async function submitRename(loraId: string) {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingLoraId(null);
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/loras/${loraId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Lora;
      setLoras((prev) => prev.map((l) => (l.id === loraId ? updated : l)));
    }
    setEditingLoraId(null);
  }

  const activeLora = loras.find((l) => l.id === activeLoraId);
  const estimatedTotal =
    progress > 0 && progress < 100
      ? Math.round((elapsedSec / progress) * 100)
      : 0;
  const remaining =
    estimatedTotal > 0 ? Math.max(0, estimatedTotal - elapsedSec) : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-semibold text-xl tracking-tight">
          QLoRA 문체 학습
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          소설 텍스트로 QLoRA 어댑터를 학습하여 문체를 재현합니다.
          Qwen2.5-14B 기반 4-bit 양자화 fine-tuning.
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          여러 파일을 업로드하면 파일별로 개별 LoRA가 생성됩니다. 비워두면 소설 챕터를 사용합니다.
        </p>
      </div>

      {/* Inference Server Status */}
      <div className="flex items-center gap-3 rounded-md border border-border px-4 py-3">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            stage === 'generating'
              ? 'bg-amber-500'
              : inferenceStatus?.running
                ? 'bg-green-500'
                : 'bg-zinc-400'
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">
            {stage === 'generating'
              ? '학습 중 — 추론 서버 일시 중지'
              : inferenceStatus?.running
                ? '추론 서버 실행 중'
                : '추론 서버 꺼짐 (추론 시 자동 시작)'}
          </p>
          {inferenceStatus?.running && inferenceStatus.lora.loaded && (
            <p className="text-muted-foreground text-xs">
              LoRA: {inferenceStatus.lora.adapter_path?.split('/').slice(-2).join('/') ?? '로드됨'}
            </p>
          )}
          {stage === 'generating' && (
            <p className="text-amber-600 text-xs dark:text-amber-400">
              학습이 끝나면 자동으로 추론 서버가 재시작됩니다
            </p>
          )}
        </div>
      </div>

      {/* LoRA Library */}
      {loras.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-sm">저장된 LoRA 목록</h3>
          <div className="divide-y divide-border rounded-md border border-border">
            {loras.map((lora) => {
              const isActive = lora.id === activeLoraId;
              const isOwnedByCurrentProject = lora.projectId === projectId;
              return (
                <div
                  className={`flex items-center gap-3 px-4 py-3 ${isActive ? 'bg-primary/5' : ''}`}
                  key={lora.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {editingLoraId === lora.id ? (
                        <input
                          autoFocus
                          className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 font-medium text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          onBlur={() => submitRename(lora.id)}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(lora.id);
                            if (e.key === 'Escape') setEditingLoraId(null);
                          }}
                          value={editingName}
                        />
                      ) : isOwnedByCurrentProject ? (
                        <button
                          className="truncate font-medium text-sm hover:underline"
                          onClick={() => startRename(lora)}
                          title="클릭하여 이름 변경"
                          type="button"
                        >
                          {lora.name}
                        </button>
                      ) : (
                        <span className="truncate font-medium text-sm">{lora.name}</span>
                      )}
                      {isActive && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                          활성
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-muted-foreground text-xs">
                      {lora.filePath}
                    </p>
                    {lora.createdAt && (
                      <p className="text-muted-foreground text-xs">
                        {new Date(lora.createdAt).toLocaleDateString('ko-KR')}
                        {lora.sourceDescription
                          ? ` · ${lora.sourceDescription}`
                          : ''}
                        {isOwnedByCurrentProject
                          ? '' : ' · 다른 프로젝트에서 생성'}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isActive ? (
                      <button
                        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                        onClick={handleDeactivate}
                        type="button"
                      >
                        비활성화
                      </button>
                    ) : (
                      <button
                        className="rounded-md bg-primary px-2.5 py-1 text-primary-foreground text-xs hover:bg-primary/90"
                        onClick={() => handleActivate(lora.id)}
                        type="button"
                      >
                        활성화
                      </button>
                    )}
                    <button
                      className="rounded-md border border-destructive/50 px-2.5 py-1 text-destructive text-xs hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!isOwnedByCurrentProject}
                      onClick={() => handleDelete(lora.id)}
                      type="button"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {activeLora && (
            <div className="space-y-1">
              <p className="font-medium text-sm">어댑터 경로</p>
              <code className="block whitespace-pre-wrap break-all rounded-sm bg-muted px-3 py-2 text-xs">
                {activeLora.filePath}
              </code>
            </div>
          )}
        </div>
      )}

      {loras.length === 0 && (
        <p className="text-muted-foreground text-sm">
          아직 생성된 LoRA가 없습니다.
        </p>
      )}

      {/* Generate Form */}
      <div className="space-y-4">
        <h3 className="font-medium text-sm">새 LoRA 생성</h3>

        <div className="space-y-2">
          <label className="font-medium text-sm" htmlFor="lora-name">
            LoRA 이름
          </label>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={stage === 'generating'}
            id="lora-name"
            onChange={(e) => setLoraName(e.target.value)}
            placeholder="예: 내 소설 스타일 v1"
            type="text"
            value={loraName}
          />
        </div>

        <div className="space-y-2">
          <label className="font-medium text-sm">
            학습 텍스트{' '}
            <span className="font-normal text-muted-foreground">
              (선택 · 여러 파일 가능 · 비워두면 소설 챕터 사용)
            </span>
          </label>
          {uploadedFileNames.length > 0 ? (
            <div className="space-y-1 rounded-md border border-border px-3 py-2 text-sm">
              {uploadedFileNames.map((name, i) => (
                <div className="flex items-center gap-2" key={name + String(i)}>
                  <span className="flex-1 truncate text-xs">{name}</span>
                </div>
              ))}
              <button
                className="mt-1 text-muted-foreground text-xs hover:text-foreground"
                disabled={stage === 'generating'}
                onClick={clearFiles}
                type="button"
              >
                모두 제거
              </button>
            </div>
          ) : (
            <input
              accept=".txt"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
              disabled={stage === 'generating'}
              multiple
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={stage === 'generating'}
            onClick={handleGenerate}
            type="button"
          >
            {stage === 'generating' ? 'QLoRA 학습 중...' : 'QLoRA 학습 시작'}
          </button>
          {stage === 'generating' && (
            <button
              className="rounded-md border border-destructive/50 px-4 py-2 font-medium text-destructive text-sm hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCancelling}
              onClick={handleCancel}
              type="button"
            >
              {isCancelling ? '취소 중...' : '학습 취소'}
            </button>
          )}
        </div>

        {stage === 'generating' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>{message}</span>
              <span>
                {elapsedSec}s 경과
                {remaining !== null ? ` · 약 ${remaining}s 남음` : ''}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${Math.max(2, progress)}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">{progress}%</p>
          </div>
        )}

        {/* Training Logs */}
        {(stage === 'generating' || stage === 'error' || stage === 'done') && logs.length > 0 && (
          <div className="space-y-1">
            <button
              className="text-muted-foreground text-xs hover:text-foreground"
              onClick={() => setShowLogs((v) => !v)}
              type="button"
            >
              {showLogs ? '▾ 학습 로그 접기' : '▸ 학습 로그 보기'} ({logs.length}줄)
            </button>
            {showLogs && (
              <div className="max-h-48 overflow-y-auto rounded-md bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300">
                {logs.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        )}

        {stage === 'error' && (
          <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive text-sm">
            오류: {error}
          </p>
        )}

        {stage === 'cancelled' && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm dark:text-amber-300">
            학습이 취소되었습니다.
          </p>
        )}

        {stage === 'done' && (
          <p className="text-green-600 text-sm dark:text-green-400">
            ✓ QLoRA 학습 완료! 라이브러리에 추가되었습니다.
          </p>
        )}
      </div>
    </div>
  );
}
