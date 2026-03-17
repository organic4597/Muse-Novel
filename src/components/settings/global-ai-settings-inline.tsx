'use client';

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

type GlobalProviderResponse = {
  providers: Array<{
    id: string;
    providerType: string;
    modelName: string | null;
    apiKeyEncrypted: string | null;
    baseUrl: string | null;
    isDefault: number | null;
  }>;
  defaultId: string | null;
};

type InferenceStatus = {
  running: boolean;
  modelId: string | null;
  lora: {
    loaded: boolean;
    adapter_path: string | null;
  };
};

type HealthStatus = {
  status: 'ok' | 'error' | 'warn';
  message: string;
  models?: string[];
} | null;

const LOCAL_PROVIDER = 'qwen-local';

function HealthStatusBadge({ health }: { health: HealthStatus }) {
  if (!health) {
    return null;
  }

  if (health.status === 'ok') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <CheckCircle2 className="size-3.5 shrink-0" />
        연결됨
      </span>
    );
  }

  if (health.status === 'warn') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
        <AlertTriangle className="size-3.5 shrink-0" />
        {health.message}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-red-500">
      <XCircle className="size-3.5 shrink-0" />
      {health.message}
    </span>
  );
}

export function GlobalAISettingsInline({
  onSaved,
}: {
  onSaved?: () => void;
}) {
  const [providerId, setProviderId] = useState<string | null>(null);
  const [providerType, setProviderType] = useState('openai');
  const [modelName, setModelName] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [localStatus, setLocalStatus] = useState<InferenceStatus | null>(null);
  const [health, setHealth] = useState<HealthStatus>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');

  const isLocalProvider = providerType === LOCAL_PROVIDER;

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        let defaultProviderType: string | null = null;
        const [settingsRes, inferenceRes] = await Promise.all([
          fetch('/api/global-ai-settings'),
          fetch('/api/ai/inference-status'),
        ]);

        if (cancelled) {
          return;
        }

        if (settingsRes.ok) {
          const data = (await settingsRes.json()) as GlobalProviderResponse;
          const defaultProvider = data.providers.find((provider) => provider.id === data.defaultId);

          if (defaultProvider) {
            setProviderId(defaultProvider.id);
            defaultProviderType = defaultProvider.providerType;
            setProviderType(defaultProvider.providerType);
            setModelName(defaultProvider.modelName ?? '');
            setApiKey(defaultProvider.apiKeyEncrypted ?? '');
            setBaseUrl(defaultProvider.baseUrl ?? '');
          }
        }

        if (inferenceRes.ok) {
          const inference = (await inferenceRes.json()) as InferenceStatus;
          setLocalStatus(inference);

          if (defaultProviderType === LOCAL_PROVIDER && inference.modelId) {
            setModelName(inference.modelId);
          }
        }
      } catch {
        if (!cancelled) {
          setError('설정을 불러오는데 실패했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLocalProvider) {
      return;
    }

    if (localStatus?.modelId) {
      setModelName(localStatus.modelId);
    }
  }, [isLocalProvider, localStatus?.modelId]);

  const handleTest = async () => {
    setIsTesting(true);
    setHealth(null);

    try {
      const url = new URL('/api/global-ai-settings/health', window.location.origin);
      url.searchParams.set('providerType', providerType);

      if (baseUrl.trim()) {
        url.searchParams.set('baseUrl', baseUrl.trim());
      }

      const apiKeyToSend =
        apiKey && !apiKey.includes('****') ? apiKey.trim() : '';
      if (apiKeyToSend) {
        url.searchParams.set('apiKey', apiKeyToSend);
      }

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

  const handleSave = async () => {
    if (!modelName.trim()) {
      setError('모델명을 입력해주세요.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const isUpdate = Boolean(providerId);
      const payload = isUpdate
        ? {
            id: providerId,
            providerType,
            modelName: modelName.trim(),
            apiKey: apiKey && !apiKey.includes('****') ? apiKey.trim() || undefined : undefined,
            baseUrl: isLocalProvider ? '' : baseUrl.trim(),
            isDefault: true,
          }
        : {
            providerType,
            modelName: modelName.trim(),
            apiKey: isLocalProvider ? undefined : apiKey.trim() || undefined,
            baseUrl: isLocalProvider ? '' : baseUrl.trim(),
            isDefault: true,
          };

      const res = await fetch('/api/global-ai-settings', {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('저장 실패');
      const saved = (await res.json()) as {
        id: string;
        apiKeyEncrypted: string | null;
      };
      setProviderId(saved.id);
      setApiKey(saved.apiKeyEncrypted ?? '');
      onSaved?.();
    } catch {
      setError('설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">스토리 구상용 AI 설정</h3>
      <p className="text-xs text-muted-foreground">
        스토리 구상 탭에서 사용할 AI를 설정하세요. 프로젝트별 AI 설정과는 별도로 적용됩니다.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          현재 설정을 불러오는 중...
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Provider</label>
          <select
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            onChange={(e) => {
              setProviderType(e.target.value);
              setHealth(null);
            }}
            value={providerType}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="ollama">Ollama</option>
            <option value="nvidia">NVIDIA</option>
            <option value="koboldcpp">KoboldCpp</option>
            <option value="qwen-local">Local</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">모델명</label>
          <input
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            onChange={(e) => setModelName(e.target.value)}
            placeholder={isLocalProvider ? '현재 실행 중인 Local LLM' : 'gpt-4o-mini'}
            readOnly={isLocalProvider}
            type="text"
            value={modelName}
          />
          {isLocalProvider && (
            <div className="mt-1 space-y-1">
              <p className="text-xs text-muted-foreground">
                Local 선택 시 현재 실행 중인 LLM 모델명을 자동으로 사용합니다.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {localStatus?.running ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-green-600" />
                    현재 실행 중: {localStatus.modelId ?? '알 수 없는 모델'}
                  </>
                ) : (
                  <>
                    <XCircle className="size-3.5 text-red-500" />
                    현재 Local LLM이 실행 중이지 않습니다.
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        {!isLocalProvider && (
          <>
            <div>
              <label className="text-xs text-muted-foreground">API Key (선택)</label>
              <input
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                type="password"
                value={apiKey}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Base URL (선택)</label>
              <input
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                type="text"
                value={baseUrl}
              />
            </div>
          </>
        )}
      </div>
      
      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={isTesting}
          onClick={handleTest}
          size="sm"
          type="button"
          variant="outline"
        >
          {isTesting ? '테스트 중...' : '연결 테스트'}
        </Button>
        <Button
          disabled={saving || (isLocalProvider && !localStatus?.running)}
          onClick={handleSave}
          size="sm"
          type="button"
        >
          {saving ? '저장 중...' : '설정 저장'}
        </Button>
        <HealthStatusBadge health={health} />
      </div>
    </div>
  );
}
