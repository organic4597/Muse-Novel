'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { OllamaModelOption } from '@/lib/ai/ollama-model-metadata';
import type { ProviderType } from '@/lib/ai/types';

type ProviderRow = {
  id: string;
  projectId: string | null;
  providerType: string;
  apiKeyEncrypted: string | null;
  modelName: string | null;
  baseUrl: string | null;
  contextSize: number | null;
  isDefault: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ProviderFormState = {
  id?: string;
  apiKey: string;
  modelName: string;
  baseUrl: string;
  isDefault: boolean;
  contextSize: string;
};

type HealthStatus = {
  status: 'ok' | 'error' | 'warn';
  message: string;
  models?: string[];
} | null;

type QwenInferenceStatus = {
  running: boolean;
  modelId: string | null;
  lora: {
    loaded: boolean;
    adapter_path: string | null;
  };
};

function parseContextSize(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

const PROVIDER_CONFIGS: {
  type: ProviderType;
  label: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
}[] = [
  {
    type: 'ollama',
    label: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434',
    requiresApiKey: false,
  },
  {
    type: 'nvidia',
    label: 'NVIDIA',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    requiresApiKey: true,
  },
  {
    type: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: '',
    requiresApiKey: true,
  },
  {
    type: 'anthropic',
    label: 'Anthropic',
    defaultBaseUrl: '',
    requiresApiKey: true,
  },
  {
    type: 'koboldcpp',
    label: 'KoboldCpp',
    defaultBaseUrl: 'http://localhost:5001',
    requiresApiKey: false,
  },
  {
    type: 'qwen-local',
    label: 'Local',
    defaultBaseUrl: 'http://localhost:8321',
    requiresApiKey: false,
  },
];

function getInitialState(
  provider: (typeof PROVIDER_CONFIGS)[number],
  existing?: ProviderRow
): ProviderFormState {
  return {
    id: existing?.id,
    apiKey: existing?.apiKeyEncrypted ?? '',
    modelName: existing?.modelName ?? '',
    baseUrl: existing?.baseUrl ?? provider.defaultBaseUrl,
    isDefault: existing?.isDefault === 1,
    contextSize: existing?.contextSize ? String(existing.contextSize) : '',
  };
}

function HealthStatusBadge({ health }: { health: HealthStatus }) {
  if (!health) return null;

  if (health.status === 'ok') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
        <CheckCircle2 className="size-4 shrink-0" />
        연결됨
      </span>
    );
  }
  if (health.status === 'warn') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-yellow-600 dark:text-yellow-400">
        <AlertTriangle className="size-4 shrink-0" />
        {health.message}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-destructive">
      <XCircle className="size-4 shrink-0" />
      {health.message}
    </span>
  );
}

function OllamaModelSelect({
  projectId,
  baseUrl,
  isActive,
  value,
  contextSize,
  onChange,
}: {
  projectId: string;
  baseUrl: string;
  isActive: boolean;
  value: string;
  contextSize: string;
  onChange: (modelName: string, recommendedContextSize?: number | null) => void;
}) {
  const [models, setModels] = useState<OllamaModelOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const selectedModel = models.find((model) => model.name === value);

  const fetchModels = async () => {
    setIsLoading(true);
    try {
      const url = new URL(
        `/api/projects/${projectId}/settings/ai/models`,
        window.location.origin
      );
      if (baseUrl) url.searchParams.set('baseUrl', baseUrl);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = (await res.json()) as { models: OllamaModelOption[] };
        setModels(data.models ?? []);
        setLoaded(true);
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? '모델 목록을 가져올 수 없습니다');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-fetch models when tab is first shown
  useEffect(() => {
    if (isActive && !loaded) {
      fetchModels();
    }
  }, [isActive, loaded]);

  useEffect(() => {
    if (!value || contextSize.trim()) {
      return;
    }

    const matchingModel = models.find((model) => model.name === value);
    if (matchingModel?.recommendedContextSize) {
      onChange(value, matchingModel.recommendedContextSize);
    }
  }, [contextSize, models, onChange, value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium" htmlFor="ollama-model">
          모델 이름 <span className="text-destructive">*</span>
        </label>
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          disabled={isLoading}
          onClick={fetchModels}
          type="button"
        >
          <RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
          모델 목록 새로고침
        </button>
      </div>

      {models.length > 0 ? (
        <div className="space-y-2">
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            id="ollama-model"
            onChange={(e) => {
              if (!e.target.value) {
                return;
              }

              const nextModel = models.find((model) => model.name === e.target.value);
              onChange(e.target.value, nextModel?.recommendedContextSize);
            }}
            value={models.some((model) => model.name === value) ? value : ''}
          >
            <option value="">모델 선택...</option>
            {models.map((model) => (
              <option key={model.name} value={model.name}>
                {model.name}
              </option>
            ))}
          </select>
          {selectedModel && (
            <p className="text-xs text-muted-foreground">
              {selectedModel.recommendedContextSize
                ? `현재 시스템 권장 컨텍스트: ${selectedModel.recommendedContextSize.toLocaleString()} 토큰`
                : '현재 시스템 권장 컨텍스트를 계산하지 못했습니다'}
              {selectedModel.maxContextSize
                ? ` · 모델 최대: ${selectedModel.maxContextSize.toLocaleString()} 토큰`
                : ''}
            </p>
          )}
        </div>
      ) : (
        <Input
          id="ollama-model"
          onChange={(e) => onChange(e.target.value)}
          placeholder={isLoading ? '모델 목록 로딩 중...' : 'llama3.2, gemma2 등'}
          required
          value={value}
        />
      )}
    </div>
  );
}

function ProviderForm({
  projectId,
  config,
  initial,
  isActive,
  onSaved,
}: {
  projectId: string;
  config: (typeof PROVIDER_CONFIGS)[number];
  initial: ProviderFormState;
  isActive: boolean;
  onSaved: () => void;
}) {
  const [formState, setFormState] = useState(initial);
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isStartingLlm, setIsStartingLlm] = useState(false);
  const [health, setHealth] = useState<HealthStatus>(null);
  const [qwenStatus, setQwenStatus] = useState<QwenInferenceStatus | null>(null);

  // Sync when initial changes (after refetch)
  useEffect(() => {
    setFormState(initial);
    setHealth(null);
  }, [
    initial.id,
    initial.apiKey,
    initial.modelName,
    initial.baseUrl,
    initial.isDefault,
    initial.contextSize,
  ]);

  const fetchQwenStatus = async () => {
    try {
      const res = await fetch('/api/ai/inference-status');
      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as QwenInferenceStatus;
      setQwenStatus(data);
    } catch {
      // ignore transient status fetch failures
    }
  };

  useEffect(() => {
    if (config.type !== 'qwen-local') {
      return;
    }

    fetchQwenStatus();
  }, [config.type]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.modelName.trim()) {
      toast.error('모델 이름을 입력하세요');
      return;
    }

    setIsSaving(true);
    try {
      const isUpdate = !!formState.id;
      const url = `/api/projects/${projectId}/ai-settings`;

      const payload = isUpdate
        ? {
            id: formState.id,
            providerType: config.type,
            modelName: formState.modelName.trim(),
            apiKey: formState.apiKey.includes('****')
              ? undefined
              : formState.apiKey || undefined,
            baseUrl: formState.baseUrl.trim() || undefined,
            isDefault: formState.isDefault,
            contextSize: parseContextSize(formState.contextSize),
          }
        : {
            providerType: config.type,
            modelName: formState.modelName.trim(),
            apiKey: formState.apiKey || undefined,
            baseUrl: formState.baseUrl.trim() || undefined,
            isDefault: formState.isDefault,
            contextSize: parseContextSize(formState.contextSize),
          };

      const res = await fetch(url, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(`${config.label} 설정이 저장되었습니다`);
        onSaved();
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
        `/api/projects/${projectId}/settings/ai/health`,
        window.location.origin
      );
      url.searchParams.set('providerType', config.type);
      if (formState.baseUrl) url.searchParams.set('baseUrl', formState.baseUrl);

      // Only send apiKey if it's a fresh value (not masked placeholder)
      const apiKeyToSend =
        formState.apiKey && !formState.apiKey.includes('****')
          ? formState.apiKey
          : '';
      if (apiKeyToSend) url.searchParams.set('apiKey', apiKeyToSend);

      const res = await fetch(url.toString());
      const data = (await res.json()) as {
        status: 'ok' | 'error' | 'warn';
        message: string;
        models?: string[];
      };
      setHealth(data);
    } catch {
      setHealth({ status: 'error', message: '네트워크 오류가 발생했습니다' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleStartLlm = async () => {
    setIsStartingLlm(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/settings/ai/qwen-local/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: formState.baseUrl.trim() || undefined,
          modelName: formState.modelName.trim() || undefined,
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        message: string;
      };

      if (!res.ok || !data.ok) {
        toast.error(data.message || 'LLM 시작에 실패했습니다');
      } else {
        toast.success(data.message || 'LLM을 시작했습니다');
        await fetchQwenStatus();
        await handleTest();
      }
    } catch {
      toast.error('LLM 시작 요청 중 네트워크 오류가 발생했습니다');
    } finally {
      setIsStartingLlm(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={handleSave}>
      {config.requiresApiKey && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${config.type}-api-key`}>
            API 키
          </label>
          <div className="relative">
            <Input
              id={`${config.type}-api-key`}
              onChange={(e) =>
                setFormState((s) => ({ ...s, apiKey: e.target.value }))
              }
              placeholder="API 키를 입력하세요"
              type={showKey ? 'text' : 'password'}
              value={formState.apiKey}
            />
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowKey((v) => !v)}
              type="button"
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {formState.apiKey.includes('****') && (
            <p className="text-xs text-muted-foreground">
              저장된 키가 있습니다. 변경하려면 새 키를 입력하세요.
            </p>
          )}
        </div>
      )}

      {config.type === 'ollama' ? (
        <OllamaModelSelect
          baseUrl={formState.baseUrl}
          contextSize={formState.contextSize}
          isActive={isActive}
          onChange={(modelName, recommendedContextSize) =>
            setFormState((s) => ({
              ...s,
              modelName,
              contextSize:
                recommendedContextSize !== null && recommendedContextSize !== undefined
                  ? String(recommendedContextSize)
                  : s.contextSize,
            }))
          }
          projectId={projectId}
          value={formState.modelName}
        />
      ) : (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`${config.type}-model`}>
            모델 이름 <span className="text-destructive">*</span>
          </label>
          <Input
            className={config.type === 'qwen-local' ? 'bg-muted text-muted-foreground cursor-default' : ''}
            id={`${config.type}-model`}
            onChange={(e) =>
              setFormState((s) => ({ ...s, modelName: e.target.value }))
            }
            placeholder={
              config.type === 'nvidia'
                ? 'meta/llama-3.1-8b-instruct 등'
                : config.type === 'openai'
                  ? 'gpt-4o, gpt-4o-mini 등'
                  : config.type === 'qwen-local'
                    ? ''
                    : 'claude-sonnet-4-20250514 등'
            }
            readOnly={config.type === 'qwen-local'}
            required
            value={formState.modelName}
          />
          {config.type === 'qwen-local' && (
            <p className="text-xs text-muted-foreground">
              모델명은 저장된 설정에서 자동으로 불러옵니다
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${config.type}-base-url`}>
          Base URL{' '}
          {!config.requiresApiKey && <span className="text-destructive">*</span>}
          {config.requiresApiKey && (
            <span className="text-muted-foreground">(선택사항)</span>
          )}
        </label>
        <Input
          id={`${config.type}-base-url`}
          onChange={(e) =>
            setFormState((s) => ({ ...s, baseUrl: e.target.value }))
          }
          placeholder={config.defaultBaseUrl || 'https://...'}
          value={formState.baseUrl}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${config.type}-context-size`}>
          컨텍스트 크기 <span className="text-muted-foreground">(선택사항)</span>
        </label>
        <Input
          id={`${config.type}-context-size`}
          onChange={(e) =>
            setFormState((s) => ({ ...s, contextSize: e.target.value }))
          }
          placeholder="예: 24000, 32768"
          type="number"
          value={formState.contextSize}
        />
        <p className="text-xs text-muted-foreground">
          Ollama 모델 선택 시 현재 시스템에서 안정적으로 동작할 권장값이 자동 입력됩니다
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          checked={formState.isDefault}
          id={`${config.type}-default`}
          onCheckedChange={(checked) =>
            setFormState((s) => ({ ...s, isDefault: checked === true }))
          }
        />
        <label
          className="cursor-pointer text-sm font-medium leading-none"
          htmlFor={`${config.type}-default`}
        >
          기본 제공자로 설정
        </label>
      </div>

      {/* Connection test section */}
      <div className="flex flex-wrap items-center gap-3">
        {config.type === 'qwen-local' && (
          <Button
            disabled={isStartingLlm || !formState.modelName.trim() || qwenStatus?.running === true}
            onClick={handleStartLlm}
            type="button"
            variant="secondary"
          >
            {isStartingLlm ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                LLM 시작 중...
              </>
            ) : qwenStatus?.running ? (
              <>
                <Play className="size-4" />
                실행 중
              </>
            ) : (
              <>
                <Play className="size-4" />
                LLM 시작
              </>
            )}
          </Button>
        )}
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
          ) : (
            '연결 테스트'
          )}
        </Button>
        <HealthStatusBadge health={health} />
      </div>

      {config.type === 'qwen-local' && qwenStatus && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {qwenStatus.running
            ? `현재 LLM 실행 중: ${qwenStatus.modelId ?? '알 수 없는 모델'}`
            : '현재 LLM이 실행 중이 아닙니다'}
          {qwenStatus.lora.loaded && qwenStatus.lora.adapter_path
            ? ` · LoRA 로드됨: ${qwenStatus.lora.adapter_path}`
            : ''}
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={isSaving || !formState.modelName.trim()} type="submit">
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
  );
}

export function AISettingsPage({ projectId }: { projectId: string }) {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProviderType>('openai');

  const fetchProviders = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-settings`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
      }
    } catch {
      toast.error('설정을 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [projectId]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const defaultProvider = providers.find((provider) => provider.isDefault === 1);
    const fallbackProvider = providers[0];
    const nextTab = (defaultProvider?.providerType ??
      fallbackProvider?.providerType ??
      'openai') as ProviderType;

    setActiveTab(nextTab);
  }, [isLoading, providers]);

  const getProviderData = (type: ProviderType): ProviderRow | undefined => providers.find((p) => p.providerType === type);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
          <Settings2 className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">AI 제공자 설정</h2>
          <p className="text-sm text-muted-foreground">
            소설 작성에 사용할 AI 제공자를 설정합니다
          </p>
        </div>
      </div>

      <Tabs onValueChange={(value) => setActiveTab(value as ProviderType)} value={activeTab}>
        <TabsList>
          {PROVIDER_CONFIGS.map((config) => {
            const existing = getProviderData(config.type);
            return (
              <TabsTrigger key={config.type} value={config.type}>
                {config.label}
                {existing?.isDefault === 1 && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    기본
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {PROVIDER_CONFIGS.map((config) => {
          const existing = getProviderData(config.type);
          return (
            <TabsContent key={config.type} value={config.type}>
              <div className="rounded-lg border border-border p-6">
                <ProviderForm
                  config={config}
                  initial={getInitialState(config, existing)}
                  isActive={activeTab === config.type}
                  onSaved={fetchProviders}
                  projectId={projectId}
                />
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
