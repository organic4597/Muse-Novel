'use client';

import {
  CheckCircle2,
  Eye,
  EyeOff,
  Ghost,
  Loader2,
  Unplug,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { ProviderType } from '@/lib/ai/types';

type GhostOverride = {
  apiKeyEncrypted: string | null;
  baseUrl: string | null;
  contextSize: number | null;
  modelName: string;
  providerType: string;
};

type Health = {
  message: string;
  status: 'ok' | 'error' | 'warn';
} | null;

const PROVIDERS: Array<{
  defaultBaseUrl: string;
  label: string;
  requiresApiKey: boolean;
  type: ProviderType;
}> = [
  {
    type: 'qwen-local',
    label: 'Local API (llama.cpp)',
    defaultBaseUrl: 'http://127.0.0.1:8080',
    requiresApiKey: false,
  },
  {
    type: 'openai-compatible',
    label: 'OpenAI 호환 API',
    defaultBaseUrl: 'http://127.0.0.1:8080/v1',
    requiresApiKey: false,
  },
  {
    type: 'ollama',
    label: 'Ollama',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    requiresApiKey: false,
  },
  {
    type: 'koboldcpp',
    label: 'KoboldCpp',
    defaultBaseUrl: 'http://127.0.0.1:5001',
    requiresApiKey: false,
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
    type: 'nvidia',
    label: 'NVIDIA',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    requiresApiKey: true,
  },
];

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function parseContextSize(value: string): number | null {
  const parsed = Number(value);
  return value.trim() && Number.isInteger(parsed) && parsed >= 1024
    ? parsed
    : null;
}

export function GhostAISettings({ projectId }: { projectId: string }) {
  const [inheritStory, setInheritStory] = useState(true);
  const [providerType, setProviderType] = useState<ProviderType>('qwen-local');
  const [modelName, setModelName] = useState('Kanana-2-30B-A3B-Instruct-2601');
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:8080');
  const [contextSize, setContextSize] = useState('32768');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<Health>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/ghost-ai-settings`);
      if (!response.ok) throw new Error('Ghost Text 설정을 불러오지 못했습니다.');
      const data = (await response.json()) as { override: GhostOverride | null };
      const override = data.override;
      setInheritStory(!override);
      if (override) {
        setProviderType(override.providerType as ProviderType);
        setModelName(override.modelName);
        setBaseUrl(override.baseUrl ?? '');
        setContextSize(override.contextSize ? String(override.contextSize) : '');
        setApiKey(override.apiKeyEncrypted ?? '');
      }
      setHealth(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const changeProvider = (nextType: ProviderType) => {
    const provider = PROVIDERS.find((item) => item.type === nextType);
    setProviderType(nextType);
    setBaseUrl(provider?.defaultBaseUrl ?? '');
    setHealth(null);
  };

  const save = async () => {
    if (!inheritStory && !modelName.trim()) {
      toast.error('Ghost Text 모델 이름을 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/ghost-ai-settings`, {
        method: inheritStory ? 'DELETE' : 'PUT',
        headers: inheritStory ? undefined : { 'Content-Type': 'application/json' },
        body: inheritStory
          ? undefined
          : JSON.stringify({
              providerType,
              modelName: modelName.trim(),
              baseUrl: baseUrl.trim() || undefined,
              contextSize: parseContextSize(contextSize),
              apiKey: apiKey.includes('****') ? undefined : apiKey || undefined,
            }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || '저장하지 못했습니다.');
      toast.success(
        inheritStory
          ? 'Ghost Text가 Story 연결을 상속합니다.'
          : 'Ghost Text 전용 연결을 저장했습니다.'
      );
      await loadSettings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setHealth(null);
    try {
      const url = new URL(
        `/api/projects/${projectId}/settings/ai/health`,
        window.location.origin
      );
      url.searchParams.set('providerType', providerType);
      url.searchParams.set('role', 'ghost');
      if (baseUrl.trim()) url.searchParams.set('baseUrl', baseUrl.trim());
      if (apiKey && !apiKey.includes('****')) {
        url.searchParams.set('apiKey', apiKey);
      }
      const response = await fetch(url);
      const data = (await response.json()) as Health;
      setHealth(data);
    } catch {
      setHealth({ status: 'error', message: '연결 테스트에 실패했습니다.' });
    } finally {
      setTesting(false);
    }
  };

  const provider = PROVIDERS.find((item) => item.type === providerType);

  return (
    <section className="space-y-5 border-t border-border/60 pt-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Ghost className="size-4" />
        </span>
        <div>
          <h4 className="font-semibold">Ghost Text 전용 연결</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            빠른 자동완성 모델을 Story 구상·집필 모델과 독립적으로 연결합니다.
            전용 연결을 끄면 프로젝트 Story 제공자와 공통 제공자 순서로 상속합니다.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 설정 불러오는 중...
        </div>
      ) : (
        <>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-muted/25 p-3 text-sm">
            <Checkbox
              checked={inheritStory}
              onCheckedChange={(checked) => {
                setInheritStory(checked === true);
                setHealth(null);
              }}
            />
            Story 제공자와 같은 연결 사용
          </label>

          {!inheritStory && (
            <div className="grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="ghost-provider">
                  제공자
                </label>
                <select
                  className={selectClass}
                  id="ghost-provider"
                  onChange={(event) => changeProvider(event.target.value as ProviderType)}
                  value={providerType}
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.type} value={item.type}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="ghost-model">모델 ID</label>
                <Input
                  id="ghost-model"
                  onChange={(event) => setModelName(event.target.value)}
                  placeholder="API가 제공하는 모델 ID"
                  value={modelName}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="ghost-base-url">Base URL</label>
                <Input
                  id="ghost-base-url"
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={provider?.defaultBaseUrl || 'https://...'}
                  value={baseUrl}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="ghost-context-size">컨텍스트 크기</label>
                <Input
                  id="ghost-context-size"
                  min={1024}
                  onChange={(event) => setContextSize(event.target.value)}
                  placeholder="32768"
                  type="number"
                  value={contextSize}
                />
              </div>

              {(provider?.requiresApiKey || providerType === 'openai-compatible') && (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="ghost-api-key">API 키</label>
                  <div className="relative">
                    <Input
                      id="ghost-api-key"
                      onChange={(event) => setApiKey(event.target.value)}
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                    />
                    <button
                      aria-label={showKey ? 'API 키 숨기기' : 'API 키 보기'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowKey((value) => !value)}
                      type="button"
                    >
                      {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <Button disabled={testing} onClick={testConnection} type="button" variant="outline">
                  {testing ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                  연결 테스트
                </Button>
                {health?.status === 'ok' && (
                  <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="size-4" /> {health.message}
                  </span>
                )}
                {health && health.status !== 'ok' && (
                  <span className="flex items-center gap-1.5 text-sm text-destructive">
                    <XCircle className="size-4" /> {health.message}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button disabled={saving} onClick={save} type="button">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {inheritStory ? '상속 설정 저장' : '전용 연결 저장'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
