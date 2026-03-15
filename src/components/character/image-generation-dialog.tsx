'use client';

import { Eye, Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PromptTagInput } from '@/components/prompt-tag-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type ImageKind = 'profile' | 'full-body' | 'illustration';

type GeneratedImageRow = {
  id: string;
  imagePath: string;
  kind: string;
  prompt: string | null;
  seed: number | null;
  width: number | null;
  height: number | null;
  isPrimary: number | null;
};

const KIND_LABELS: Record<ImageKind, string> = {
  profile: '프로필 (상반신)',
  'full-body': '전신샷',
  illustration: '일러스트',
};

const DEFAULT_BATCH: Record<ImageKind, number> = {
  profile: 4,
  'full-body': 2,
  illustration: 2,
};

type LoraOption = {
  id: string;
  name: string;
  type: string;
  format: string;
  description: string;
  triggerWords: string[];
  recommendedWeight: number;
  downloaded: boolean;
  fileSize: number;
};

type ProgressState = {
  status: string;
  message: string;
  step: number;
  totalSteps: number;
  progress: number;
  elapsed: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  characterId: string;
  characterName: string;
  onGenerated: () => void;
};

export function ImageGenerationDialog({
  open,
  onOpenChange,
  projectId,
  characterId,
  characterName,
  onGenerated,
}: Props) {
  const [kind, setKind] = useState<ImageKind>('profile');
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [batchSize, setBatchSize] = useState<number>(DEFAULT_BATCH.profile);
  const [loraOptions, setLoraOptions] = useState<LoraOption[]>([]);
  const [selectedLoraId, setSelectedLoraId] = useState<string>('');
  const [loraWeight, setLoraWeight] = useState<number>(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ prompt: string; negativePrompt: string } | null>(null);
  const [results, setResults] = useState<GeneratedImageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    status: '',
    message: '',
    step: 0,
    totalSteps: 0,
    progress: 0,
    elapsed: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  // Fetch LoRA registry on open
  useEffect(() => {
    if (!open) return;
    fetch('/api/lora-registry')
      .then((res) => res.json())
      .then((data: LoraOption[]) => setLoraOptions(data))
      .catch(() => {});
  }, [open]);

  const handleLoraChange = (loraId: string) => {
    setSelectedLoraId(loraId);
    if (loraId) {
      const lora = loraOptions.find((l) => l.id === loraId);
      if (lora) setLoraWeight(lora.recommendedWeight);
    } else {
      setLoraWeight(1.0);
    }
  };

  const handleKindChange = (newKind: ImageKind) => {
    setKind(newKind);
    setBatchSize(DEFAULT_BATCH[newKind]);
    setPreview(null);
    setResults([]);
  };

  const fetchPreview = async () => {
    setIsPreviewing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/images`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            additionalPrompt: additionalPrompt.trim() || undefined,
            previewOnly: true,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? '프롬프트 미리보기에 실패했습니다.');
        return;
      }
      const data = await res.json();
      setPreview(data);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setResults([]);
    setProgress({
      status: 'connecting',
      message: '서버에 연결 중...',
      step: 0,
      totalSteps: 0,
      progress: 0,
      elapsed: 0,
    });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/images/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            additionalPrompt: additionalPrompt.trim() || undefined,
            batchSize,
            loraId: selectedLoraId || undefined,
            loraWeight: selectedLoraId ? loraWeight : undefined,
          }),
          signal: abort.signal,
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(data.error ?? '이미지 생성에 실패했습니다.');
        setIsGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('스트리밍을 지원하지 않는 환경입니다.');
        setIsGenerating(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? ''; // keep incomplete event

        for (const part of parts) {
          let eventName = '';
          let eventData = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) {
              eventName = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }
          if (eventName && eventData) {
            try {
              const data = JSON.parse(eventData);
              handleSSEEvent(eventName, data);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [projectId, characterId, kind, additionalPrompt, batchSize, selectedLoraId, loraWeight]);

  const handleSSEEvent = useCallback(
    (event: string, data: Record<string, unknown>) => {
      switch (event) {
        case 'status':
          setProgress((prev) => ({
            ...prev,
            status: String(data.status ?? ''),
            message: String(data.message ?? ''),
          }));
          break;
        case 'progress':
          setProgress((prev) => ({
            ...prev,
            status: 'generating',
            message: `이미지 생성 중... (${data.step}/${data.totalSteps} steps)`,
            step: Number(data.step ?? 0),
            totalSteps: Number(data.totalSteps ?? 0),
            progress: Number(data.progress ?? 0),
            elapsed: Number(data.elapsed ?? 0),
          }));
          break;
        case 'complete': {
          const images = data.images as GeneratedImageRow[];
          setResults(images ?? []);
          setProgress((prev) => ({
            ...prev,
            status: 'complete',
            message: '완료!',
            progress: 100,
          }));
          onGenerated();
          break;
        }
        case 'error':
          setError(String(data.error ?? '이미지 생성에 실패했습니다.'));
          break;
      }
    },
    [onGenerated]
  );

  const handleSetPrimary = async (imageId: string) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/images/${imageId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPrimary: true }),
        }
      );
      if (res.ok) {
        onGenerated();
        setResults((prev) =>
          prev.map((img) => ({
            ...img,
            isPrimary: img.id === imageId ? 1 : 0,
          }))
        );
      }
    } catch {
      // ignore
    }
  };

  // Progress bar color based on status
  const getProgressColor = () => {
    switch (progress.status) {
      case 'loading_model':
        return 'bg-amber-500';
      case 'loading_lora':
        return 'bg-purple-500';
      case 'generating':
        return 'bg-blue-500';
      case 'saving':
      case 'saving_db':
        return 'bg-green-500';
      case 'complete':
        return 'bg-green-500';
      default:
        return 'bg-primary';
    }
  };

  // Status icon/emoji
  const getStatusIcon = () => {
    switch (progress.status) {
      case 'starting':
      case 'connecting':
        return '🔌';
      case 'gpu_ready':
        return '🖥️';
      case 'loading_lora':
        return '🎨';
      case 'loading_model':
        return '📦';
      case 'generating':
        return '🎨';
      case 'saving':
      case 'saving_db':
        return '💾';
      case 'complete':
        return '✅';
      default:
        return '⏳';
    }
  };

  return (
    <Dialog
      onOpenChange={(val) => {
        if (isGenerating && !val) return; // Prevent closing during generation
        onOpenChange(val);
      }}
      open={open}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>이미지 생성 — {characterName}</DialogTitle>
          <DialogDescription>
            캐릭터 정보를 기반으로 이미지를 생성합니다
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Kind Select */}
          <div className="space-y-2">
            <label className="text-sm font-medium">이미지 종류</label>
            <div className="flex gap-2">
              {(Object.keys(KIND_LABELS) as ImageKind[]).map((k) => (
                <button
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    kind === k
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-foreground/30'
                  } disabled:opacity-50`}
                  disabled={isGenerating}
                  key={k}
                  onClick={() => handleKindChange(k)}
                  type="button"
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {/* Additional Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="additional-prompt">
              추가 지시문 <span className="text-muted-foreground">(선택사항)</span>
            </label>
            <PromptTagInput
              characterId={characterId}
              disabled={isGenerating}
              onChange={setAdditionalPrompt}
              placeholder="태그 입력 후 Enter (예: smile, blue eyes, forest)"
              value={additionalPrompt}
            />
          </div>

          {/* Batch Size */}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="batch-size">
              생성 장수
            </label>
            <Input
              disabled={isGenerating}
              id="batch-size"
              max={8}
              min={1}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)}
              type="number"
              value={batchSize}
            />
          </div>

          {/* LoRA Selection */}
          {loraOptions.length > 0 && (
            <div className="space-y-3">
              <label className="text-sm font-medium">LoRA 스타일</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                disabled={isGenerating}
                onChange={(e) => handleLoraChange(e.target.value)}
                value={selectedLoraId}
              >
                <option value="">없음 (기본 스타일)</option>
                {loraOptions.map((lora) => (
                  <option
                    disabled={!lora.downloaded}
                    key={lora.id}
                    value={lora.id}
                  >
                    {lora.name}
                    {lora.downloaded ? '' : ' (다운로드 필요)'}
                    {lora.format === 'lokr' ? ' ⚠️ LoKR' : ''}
                    {' — '}
                    {lora.type}
                  </option>
                ))}
              </select>

              {/* Selected LoRA info */}
              {selectedLoraId && (() => {
                const lora = loraOptions.find((l) => l.id === selectedLoraId);
                if (!lora) return null;
                return (
                  <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                    {lora.format === 'lokr' && (
                      <p className="text-xs text-amber-600 font-medium">
                        ⚠️ LoKR 포맷 — 현재 버전에서 미지원. LoRA 없이 생성됩니다.
                      </p>
                    )}
                    <p className="text-sm">{lora.description}</p>
                    {lora.triggerWords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-muted-foreground">트리거:</span>
                        {lora.triggerWords.map((tw) => (
                          <span
                            className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                            key={tw}
                          >
                            {tw}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">강도 (Weight)</span>
                        <span className="text-xs font-mono">{loraWeight.toFixed(2)}</span>
                      </div>
                      <input
                        className="w-full accent-primary"
                        disabled={isGenerating}
                        max={1.5}
                        min={0}
                        onChange={(e) => setLoraWeight(parseFloat(e.target.value))}
                        step={0.05}
                        type="range"
                        value={loraWeight}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Preview / Generate buttons */}
          <div className="flex gap-2">
            <Button
              disabled={isPreviewing || isGenerating}
              onClick={fetchPreview}
              type="button"
              variant="outline"
            >
              {isPreviewing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              프롬프트 미리보기
            </Button>
            <Button
              disabled={isGenerating}
              onClick={handleGenerate}
              type="button"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  이미지 생성
                </>
              )}
            </Button>
          </div>

          {/* === Progress Panel === */}
          {isGenerating && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              {/* Status message */}
              <div className="flex items-center gap-2">
                <span className="text-lg">{getStatusIcon()}</span>
                <span className="text-sm font-medium">{progress.message || '준비 중...'}</span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${getProgressColor()}`}
                    style={{
                      width: progress.progress > 0
                        ? `${progress.progress}%`
                        : (progress.status === 'loading_model' || progress.status === 'loading_lora')
                        ? '100%'
                        : '0%',
                      ...((progress.status === 'loading_model' || progress.status === 'loading_lora') && progress.progress === 0
                        ? { animation: 'pulse 2s ease-in-out infinite' }
                        : {}),
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  {progress.step > 0 ? (
                    <>
                      <span>Step {progress.step} / {progress.totalSteps}</span>
                      <span>{progress.progress}%</span>
                    </>
                  ) : (
                    <span>&nbsp;</span>
                  )}
                  {progress.elapsed > 0 && (
                    <span>경과: {progress.elapsed.toFixed(1)}초</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Prompt Preview */}
          {preview && !isGenerating && (
            <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">프롬프트</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{preview.prompt}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">네거티브 프롬프트</p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                  {preview.negativePrompt}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">생성 결과 ({results.length}장)</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {results.map((img) => (
                  <div
                    className="group relative overflow-hidden rounded-lg border border-border"
                    key={img.id}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="생성된 캐릭터 이미지"
                      className="aspect-square w-full object-cover"
                      src={img.imagePath}
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        className="h-7 text-xs"
                        onClick={() => handleSetPrimary(img.id)}
                        size="sm"
                        variant="secondary"
                      >
                        {img.isPrimary === 1 ? '✓ 대표' : '대표로 지정'}
                      </Button>
                    </div>
                    {img.isPrimary === 1 && (
                      <div className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        대표
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
