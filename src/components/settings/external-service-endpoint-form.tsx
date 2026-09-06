'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExternalServiceType } from '@/lib/db/queries/external-services';

export function ExternalServiceEndpointForm({
  serviceType,
  projectId,
  title,
  description,
  defaultUrl,
  healthPath = '/health',
}: {
  serviceType: ExternalServiceType;
  projectId?: string;
  title: string;
  description: string;
  defaultUrl: string;
  healthPath?: string;
}) {
  const [baseUrl, setBaseUrl] = useState(defaultUrl);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ serviceType });
    if (projectId) params.set('projectId', projectId);

    let cancelled = false;
    fetch(`/api/external-services?${params.toString()}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((setting: { baseUrl?: string } | null) => {
        if (!cancelled && setting?.baseUrl) setBaseUrl(setting.baseUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ ok: false, message: '저장된 API 설정을 불러오지 못했습니다.' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, serviceType]);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch('/api/external-services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceType, projectId, baseUrl }),
      });
      const data = (await response.json()) as {
        error?: string;
        baseUrl?: string;
      };
      if (!response.ok) {
        setResult({ ok: false, message: data.error ?? '저장하지 못했습니다.' });
        return;
      }
      if (data.baseUrl) setBaseUrl(data.baseUrl);
      setResult({ ok: true, message: 'API URL을 저장했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const response = await fetch('/api/external-services/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, healthPath, serviceType }),
      });
      setResult((await response.json()) as { ok: boolean; message: string });
    } catch {
      setResult({ ok: false, message: '연결 테스트 요청에 실패했습니다.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="muse-panel space-y-4 p-5 sm:p-6">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor={`${serviceType}-url`}>
          API Base URL
        </label>
        <Input
          disabled={loading}
          id={`${serviceType}-url`}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder={defaultUrl}
          value={baseUrl}
        />
        <p className="text-xs text-muted-foreground">
          {serviceType === 'web-search'
            ? '연결 테스트는 SearXNG의 JSON 검색을 실제로 호출합니다.'
            : <>연결 테스트는 <code>{healthPath}</code>를 호출합니다.</>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={testing || !baseUrl.trim()} onClick={handleTest} type="button" variant="outline">
          {testing && <Loader2 className="animate-spin" />}
          연결 테스트
        </Button>
        <Button disabled={saving || !baseUrl.trim()} onClick={handleSave} type="button">
          {saving && <Loader2 className="animate-spin" />}
          URL 저장
        </Button>
        {result && (
          <span className={result.ok ? 'flex items-center gap-1 text-sm text-green-600' : 'flex items-center gap-1 text-sm text-destructive'}>
            {result.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}
