'use client';

import {
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_DIFFUSERS_MODEL } from '@/lib/image-gen/types';

type ImageProviderRow = {
  id: string;
  projectId: string | null;
  providerType: string;
  baseUrl: string | null;
  modelName: string | null;
  isDefault: number | null;
  defaultWidth: number | null;
  defaultHeight: number | null;
  defaultSteps: number | null;
  defaultSampler: string | null;
  defaultCfgScale: number | null;
  defaultNegativePrompt: string | null;
};

type ProviderType = 'diffusers' | 'automatic1111';

type FormState = {
  id?: string;
  providerType: ProviderType;
  baseUrl: string;
  modelName: string;
  defaultWidth: string;
  defaultHeight: string;
  defaultSteps: string;
  defaultSampler: string;
  defaultCfgScale: string;
  defaultNegativePrompt: string;
};

const SAMPLER_OPTIONS = [
  { value: 'euler_a', label: 'Euler Ancestral' },
  { value: 'euler', label: 'Euler' },
  { value: 'dpm++_2m', label: 'DPM++ 2M' },
];

function getInitialState(existing?: ImageProviderRow): FormState {
  return {
    id: existing?.id,
    providerType: (existing?.providerType as ProviderType) ?? 'diffusers',
    baseUrl: existing?.baseUrl ?? 'http://localhost:7860',
    modelName: existing?.modelName ?? DEFAULT_DIFFUSERS_MODEL,
    defaultWidth: String(existing?.defaultWidth ?? 1024),
    defaultHeight: String(existing?.defaultHeight ?? 1024),
    defaultSteps: String(existing?.defaultSteps ?? 24),
    defaultSampler: existing?.defaultSampler ?? 'euler_a',
    defaultCfgScale: String(existing?.defaultCfgScale ?? 6),
    defaultNegativePrompt: existing?.defaultNegativePrompt ?? '',
  };
}

type HealthStatus = { status: 'ok' | 'error'; message: string } | null;

export function ImageSettingsPage({ projectId }: { projectId: string }) {
  const [providers, setProviders] = useState<ImageProviderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formState, setFormState] = useState<FormState>(getInitialState());
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [health, setHealth] = useState<HealthStatus>(null);

  const fetchProviders = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/image-settings`);
      if (res.ok) {
        const data = (await res.json()) as ImageProviderRow[];
        setProviders(data);
        const defaultProvider = data.find((p) => p.isDefault === 1) ?? data[0];
        if (defaultProvider) {
          setFormState(getInitialState(defaultProvider));
        }
      }
    } catch {
      toast.error('이미지 설정을 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [projectId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formState.providerType === 'automatic1111' && !formState.baseUrl.trim()) {
      toast.error('Base URL을 입력하세요');
      return;
    }

    setIsSaving(true);
    try {
      const isUpdate = !!formState.id;
      const payload = {
        ...(isUpdate ? { id: formState.id } : {}),
        providerType: formState.providerType,
        baseUrl:
          formState.providerType === 'automatic1111'
            ? formState.baseUrl.trim()
            : undefined,
        modelName: formState.modelName.trim() || undefined,
        isDefault: true,
        defaultWidth: parseInt(formState.defaultWidth) || 1024,
        defaultHeight: parseInt(formState.defaultHeight) || 1024,
        defaultSteps: parseInt(formState.defaultSteps) || 20,
        defaultSampler: formState.defaultSampler.trim() || 'euler_a',
        defaultCfgScale: parseInt(formState.defaultCfgScale) || 7,
        defaultNegativePrompt: formState.defaultNegativePrompt.trim() || undefined,
      };

      const res = await fetch(`/api/projects/${projectId}/image-settings`, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success('이미지 생성 설정이 저장되었습니다');
        fetchProviders();
      } else {
        const data = await res.json();
        toast.error(data.error || '저장에 실패했습니다');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setHealth(null);
    try {
      const url = new URL(
        `/api/projects/${projectId}/image-settings/health`,
        window.location.origin
      );
      url.searchParams.set('providerType', formState.providerType);
      if (formState.providerType === 'automatic1111') {
        url.searchParams.set('baseUrl', formState.baseUrl.trim());
      }

      const res = await fetch(url.toString());
      const data = (await res.json()) as { status: 'ok' | 'error'; message: string };
      setHealth(data);
    } catch {
      setHealth({ status: 'error', message: '네트워크 오류가 발생했습니다' });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isDiffusers = formState.providerType === 'diffusers';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
          <ImageIcon className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">이미지 생성 설정</h2>
          <p className="text-sm text-muted-foreground">
            캐릭터 이미지 생성에 사용할 AI 모델을 설정합니다
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-6">
        <form className="space-y-5" onSubmit={handleSave}>
          {/* Provider Type Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">이미지 생성 방식</label>
            <div className="flex gap-3">
              <button
                className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                  isDiffusers
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-muted-foreground'
                }`}
                onClick={() =>
                  setFormState((s) => ({
                    ...s,
                    providerType: 'diffusers',
                    modelName: s.modelName || DEFAULT_DIFFUSERS_MODEL,
                    defaultWidth: String(parseInt(s.defaultWidth) || 1024),
                    defaultHeight: String(parseInt(s.defaultHeight) || 1024),
                    defaultSteps: String(parseInt(s.defaultSteps) || 24),
                    defaultCfgScale: String(parseInt(s.defaultCfgScale) || 6),
                  }))
                }
                type="button"
              >
                🤗 Diffusers (로컬)
              </button>
              <button
                className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                  isDiffusers
                    ? 'border-border hover:border-muted-foreground' : 'border-primary bg-primary/10 text-primary'
                }`}
                onClick={() =>
                  setFormState((s) => ({ ...s, providerType: 'automatic1111' }))
                }
                type="button"
              >
                🎨 SD WebUI (API)
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isDiffusers
                ? 'HuggingFace diffusers로 로컬에서 직접 생성합니다. 별도 서버 불필요, VRAM 자동 관리.'
                : 'Stable Diffusion WebUI (Automatic1111/Forge)의 API를 사용합니다.'}
            </p>
          </div>

          {/* Model Name / ID */}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="sd-model">
              {isDiffusers ? 'HuggingFace 모델 ID' : '모델 체크포인트'}{' '}
              <span className="text-muted-foreground">(선택사항)</span>
            </label>
            <Input
              id="sd-model"
              onChange={(e) =>
                setFormState((s) => ({ ...s, modelName: e.target.value }))
              }
              placeholder={
                isDiffusers
                  ? DEFAULT_DIFFUSERS_MODEL
                  : 'sd_xl_base_1.0.safetensors'
              }
              value={formState.modelName}
            />
            {isDiffusers && (
              <p className="text-xs text-muted-foreground">
                최초 생성 시 모델이 자동으로 다운로드됩니다. Illustrious XL은 SDXL 계열이라 12GB VRAM 기준으로 운용됩니다.
              </p>
            )}
          </div>

          {/* Base URL (A1111 only) */}
          {!isDiffusers && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sd-base-url">
                WebUI Base URL <span className="text-destructive">*</span>
              </label>
              <Input
                id="sd-base-url"
                onChange={(e) =>
                  setFormState((s) => ({ ...s, baseUrl: e.target.value }))
                }
                placeholder="http://localhost:7860"
                required
                value={formState.baseUrl}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sd-width">
                기본 너비
              </label>
              <Input
                id="sd-width"
                onChange={(e) =>
                  setFormState((s) => ({ ...s, defaultWidth: e.target.value }))
                }
                type="number"
                value={formState.defaultWidth}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sd-height">
                기본 높이
              </label>
              <Input
                id="sd-height"
                onChange={(e) =>
                  setFormState((s) => ({ ...s, defaultHeight: e.target.value }))
                }
                type="number"
                value={formState.defaultHeight}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sd-steps">
                Steps
              </label>
              <Input
                id="sd-steps"
                onChange={(e) =>
                  setFormState((s) => ({ ...s, defaultSteps: e.target.value }))
                }
                type="number"
                value={formState.defaultSteps}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sd-sampler">
                Sampler
              </label>
              {isDiffusers ? (
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  id="sd-sampler"
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, defaultSampler: e.target.value }))
                  }
                  value={formState.defaultSampler}
                >
                  {SAMPLER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="sd-sampler"
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, defaultSampler: e.target.value }))
                  }
                  placeholder="Euler a"
                  value={formState.defaultSampler}
                />
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="sd-cfg">
                CFG Scale
              </label>
              <Input
                id="sd-cfg"
                onChange={(e) =>
                  setFormState((s) => ({ ...s, defaultCfgScale: e.target.value }))
                }
                type="number"
                value={formState.defaultCfgScale}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="sd-negative">
              기본 네거티브 프롬프트 <span className="text-muted-foreground">(선택사항)</span>
            </label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              id="sd-negative"
              onChange={(e) =>
                setFormState((s) => ({ ...s, defaultNegativePrompt: e.target.value }))
              }
              placeholder="기본 품질 관련 네거티브 프롬프트는 자동으로 추가됩니다"
              value={formState.defaultNegativePrompt}
            />
          </div>

          {/* Info box for diffusers */}
          {isDiffusers && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/30">
              <p className="font-medium text-blue-800 dark:text-blue-300">
                💡 VRAM 자동 관리
              </p>
              <p className="mt-1 text-blue-700 dark:text-blue-400">
                이미지 생성 시 추론 서버를 자동으로 중지하고, 생성 완료 후 다시 시작합니다.
                LoRA 학습 중에는 이미지 생성이 불가능합니다.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={isTesting}
              onClick={handleTest}
              type="button"
              variant="outline"
            >
              {isTesting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  테스트 중...
                </>
              ) : isDiffusers ? (
                '환경 확인'
              ) : (
                '연결 테스트'
              )}
            </Button>
            {health && (
              <span
                className={`flex items-center gap-1.5 text-sm ${
                  health.status === 'ok'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-destructive'
                }`}
              >
                {health.status === 'ok' ? (
                  <CheckCircle2 className="size-4 shrink-0" />
                ) : (
                  <XCircle className="size-4 shrink-0" />
                )}
                {health.message}
              </span>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              disabled={
                isSaving ||
                (!isDiffusers && !formState.baseUrl.trim())
              }
              type="submit"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                '저장'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
