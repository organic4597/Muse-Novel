'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { OpenCodeOAuthState } from '@/lib/ai/opencode-oauth-types';

export function OpenCodeOAuthConnection({ projectId, onSaved }: { projectId?: string; onSaved?: () => void }) {
  const [account, setAccount] = useState<OpenCodeOAuthState>({ connected: false, models: [] });
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const loginCode = account.login?.userCode;
  const selectedAvailable = account.models.some(item => item.id === model);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/opencode-oauth-account', { signal, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'OAuth 상태를 확인하지 못했습니다.');
    if (signal?.aborted) return;
    setAccount(data);
    setModel(current => data.models.some((item: { id: string }) => item.id === current)
      ? current : data.models.find((item: { isDefault: boolean }) => item.isDefault)?.id ?? data.models[0]?.id ?? '');
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    const endpoint = projectId ? `/api/projects/${projectId}/ai-settings` : '/api/global-ai-settings';
    void fetch(endpoint, { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => {
      if (!data || controller.signal.aborted) return;
      const providers = projectId ? data : data.providers;
      const saved = providers.find((provider: { providerType: string }) => provider.providerType === 'opencode-oauth');
      if (saved?.modelName) setModel(saved.modelName);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [projectId, refresh]);
  useEffect(() => {
    if (!loginCode || account.connected) return;
    const controller = new AbortController(); let polling = false;
    const timer = setInterval(() => {
      if (polling) return;
      polling = true; void refresh(controller.signal).catch(() => undefined).finally(() => { polling = false; });
    }, 3000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [account.connected, loginCode, refresh]);
  async function connectionAction(method: 'POST' | 'DELETE') {
    if (method === 'DELETE' && !window.confirm('이 서버의 ChatGPT OAuth 연결을 해제할까요? 원고와 기존 API 설정은 유지됩니다.')) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/opencode-oauth-account', { method }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'OAuth 요청에 실패했습니다.');
      setAccount(data); if (data.connected) await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '연결 실패'); }
    finally { setBusy(false); }
  }
  async function saveProvider() {
    if (!account.connected || !selectedAvailable) return;
    setBusy(true); setMessage('');
    try {
      const endpoint = projectId ? `/api/projects/${projectId}/ai-settings` : '/api/global-ai-settings';
      const response = await fetch(endpoint); const data = await response.json();
      if (!response.ok) throw new Error('기존 제공자 설정을 읽지 못했습니다.');
      const providers = projectId ? data : data.providers;
      const existing = providers.find((provider: { providerType: string }) => provider.providerType === 'opencode-oauth');
      const saved = await fetch(endpoint, { method: existing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existing?.id, providerType: 'opencode-oauth', modelName: model, isDefault: true, contextSize: 131072 }) });
      if (!saved.ok) throw new Error('기본 제공자로 저장하지 못했습니다.');
      setMessage(projectId ? '이 작품의 기본 AI로 설정했습니다.' : '공통 기본 AI로 설정했습니다. 작품별 설정이 있으면 해당 설정이 우선합니다.'); onSaved?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : '설정 저장 실패'); }
    finally { setBusy(false); }
  }
  return <section aria-label="OpenCode 방식 ChatGPT OAuth" className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
    <h3 className="font-semibold">ChatGPT OAuth · OpenCode 호환 모듈</h3>
    <p className="text-sm leading-6 text-muted-foreground">OpenCode의 MIT 라이선스 OAuth·토큰 갱신·Responses 전송 부분만 포함합니다. OpenCode 프로세스나 코딩 도구는 실행하지 않습니다. API 키 없이 ChatGPT Codex 사용 한도를 사용하며 선택한 원고·설정이 OpenAI에 전달됩니다.</p>
    {account.connected ? <p className="text-sm text-primary">연결됨 · {account.email ?? 'ChatGPT 계정'}</p> : <p className="text-sm">연결되지 않음</p>}
    {account.error && <p className="text-sm text-amber-600">{account.error}</p>}
    {account.login && !account.connected && <div className="space-y-2 rounded-lg border border-primary/30 p-3">
      <p className="text-sm">OpenAI 로그인 페이지에서 본인 계정으로 로그인하고 아래 일회용 코드를 입력하세요.</p>
      <p className="select-all font-mono text-xl tracking-wider">{account.login.userCode}</p>
      <a href={account.login.verificationUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">OpenAI 로그인 열기</a>
      <p className="text-xs text-muted-foreground">비밀번호나 토큰을 Muse Novel에 직접 입력하지 않습니다. 완료 상태는 자동으로 확인합니다.</p>
    </div>}
    <div className="flex flex-wrap gap-2">
      {!account.connected && <Button type="button" disabled={busy || Boolean(account.login)} onClick={() => void connectionAction('POST')}>ChatGPT로 로그인</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void refresh().catch(error => setMessage(error.message))}>상태 새로고침</Button>
      {(account.connected || account.login) && <Button type="button" variant="outline" disabled={busy} onClick={() => void connectionAction('DELETE')}>연결 해제</Button>}
    </div>
    {account.connected && <>
      <label className="block text-sm">사용할 모델
        <select aria-label="사용할 ChatGPT OAuth 모델" className="mt-2 w-full rounded-lg border border-border bg-background p-2" value={model} onChange={event => setModel(event.target.value)}>
          {!selectedAvailable && <option value={model} disabled>사용 가능한 모델을 선택해주세요.</option>}
          {account.models.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
        </select>
      </label>
      <Button type="button" disabled={busy || !selectedAvailable} onClick={() => void saveProvider()}>{projectId ? '이 작품의 기본 AI로 사용' : '공통 기본 AI로 사용'}</Button>
    </>}
    <p className="text-xs leading-5 text-muted-foreground">기존 API 제공자는 삭제하지 않습니다. 텍스트·스트리밍·JSON 요청은 같은 제공자 인터페이스를 사용하지만 OAuth 백엔드가 지원하지 않는 샘플링 옵션은 무시될 수 있습니다. 이미지·임베딩과 실시간 Ghost Text는 기존 전용 제공자를 사용하세요.</p>
    {message && <p className="text-sm" role="status">{message}</p>}
  </section>;
}
