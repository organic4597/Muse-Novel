'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ChatGPTAccountState } from '@/lib/ai/chatgpt-account';

export function ChatGPTConnection({ projectId, onSaved }: { projectId?: string; onSaved?: () => void }) {
  const [account, setAccount] = useState<ChatGPTAccountState>({ connected: false, models: [] });
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const loginCode = account.login?.userCode;
  const selectedAvailable = account.models.some(item => item.id === model);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/chatgpt-account', { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다.');
    const data = await response.json() as ChatGPTAccountState;
    if (signal?.aborted) return;
    setAccount(data);
    setModel(current => data.models.some(item => item.id === current) ? current : data.models.find(item => item.isDefault)?.id ?? data.models[0]?.id ?? '');
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => { if (!controller.signal.aborted) setMessage('계정 상태를 불러오지 못했습니다.'); });
    const endpoint = projectId ? `/api/projects/${projectId}/ai-settings` : '/api/global-ai-settings';
    void fetch(endpoint, { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => {
      if (!data || controller.signal.aborted) return;
      const providers = projectId ? data : data.providers;
      const saved = providers.find((provider: { providerType: string }) => provider.providerType === 'chatgpt');
      if (saved?.modelName) setModel(saved.modelName);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [refresh, projectId]);
  useEffect(() => {
    if (!loginCode || account.connected) return;
    const controller = new AbortController();
    let polling = false;
    const timer = setInterval(() => {
      if (polling) return;
      polling = true;
      void refresh(controller.signal).catch(() => undefined).finally(() => { polling = false; });
    }, 3000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [loginCode, account.connected, refresh]);
  const action = async (method: 'POST' | 'DELETE') => {
    if (method === 'DELETE' && !window.confirm('이 서버의 ChatGPT 계정 연결을 해제할까요? 기존 API 설정과 원고는 유지됩니다.')) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/chatgpt-account', { method });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '연결 요청을 완료하지 못했습니다.');
      setAccount(data); if (data.connected) await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '연결 실패'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!account.connected || !selectedAvailable) return;
    setBusy(true); setMessage('');
    try {
      const endpoint = projectId ? `/api/projects/${projectId}/ai-settings` : '/api/global-ai-settings';
      const response = await fetch(endpoint); const data = await response.json();
      if (!response.ok) throw new Error('기존 제공자 설정을 읽지 못했습니다.');
      const providers = projectId ? data : data.providers;
      const existing = providers.find((provider: { providerType: string }) => provider.providerType === 'chatgpt');
      const saved = await fetch(endpoint, { method: existing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existing?.id, providerType: 'chatgpt', modelName: model, isDefault: true, contextSize: 32768 }) });
      if (!saved.ok) throw new Error('기본 제공자로 저장하지 못했습니다.');
      setMessage(projectId ? '이 작품의 기본 AI를 ChatGPT 계정 연결로 설정했습니다.' : '공통 기본 AI를 ChatGPT 계정 연결로 설정했습니다. 작품별 설정이 있으면 해당 설정이 우선합니다.');
      onSaved?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : '설정 저장 실패'); }
    finally { setBusy(false); }
  };
  return <section aria-label="ChatGPT 계정 연결" className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
    <h3 className="font-semibold">ChatGPT 계정 연결 · 실험 기능</h3>
    <p className="text-sm leading-6 text-muted-foreground">API 키 없이 ChatGPT의 Codex 사용 한도로 이용합니다. 선택한 원고·설정이 OpenAI에 전달됩니다. 이 Muse Novel 서버의 관리자 연결이며 작품들이 공유합니다. 계정 비밀번호나 토큰을 이 웹사이트에 붙여넣지 마세요.</p>
    {account.connected ? <p className="text-sm text-primary">연결됨 · {account.email ?? 'ChatGPT 계정'} {account.plan ? `(${account.plan})` : ''}</p> : <p className="text-sm">연결되지 않음</p>}
    {account.error && <p className="text-sm text-amber-600">{account.error}</p>}
    {account.login && !account.connected && <div className="space-y-2 rounded-lg border border-primary/30 p-3">
      <p className="text-sm">공식 로그인 페이지에서 본인 계정으로 로그인한 다음 아래 일회용 코드를 입력하세요.</p>
      <p className="select-all font-mono text-xl tracking-wider">{account.login.userCode}</p>
      <a href={account.login.verificationUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">OpenAI 공식 로그인 열기</a>
      <p className="text-xs text-muted-foreground">인증이 완료되면 자동으로 연결됩니다. 기기 코드 로그인이 비활성화되어 있다면 ChatGPT 보안 설정에서 허용해주세요.</p>
    </div>}
    <div className="flex flex-wrap gap-2">
      {!account.connected && <Button type="button" disabled={busy || Boolean(account.login)} onClick={() => void action('POST')}>ChatGPT로 로그인</Button>}
      <Button type="button" variant="outline" disabled={busy} onClick={() => void refresh().catch(() => setMessage('상태 확인에 실패했습니다.'))}>상태 새로고침</Button>
      {(account.connected || account.login) && <Button type="button" variant="outline" disabled={busy} onClick={() => void action('DELETE')}>연결 해제</Button>}
    </div>
    {account.connected && <>
      <label className="block text-sm">사용할 ChatGPT 모델
        <select aria-label="사용할 ChatGPT 모델" className="mt-2 w-full rounded-lg border border-border bg-background p-2" value={model} onChange={event => setModel(event.target.value)}>
          {!selectedAvailable && <option value={model} disabled>사용 가능한 모델을 선택해주세요.</option>}
          {account.models.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
        </select>
      </label>
      <Button type="button" disabled={busy || !selectedAvailable} onClick={() => void save()}>{projectId ? '이 작품의 기본 AI로 사용' : '공통 기본 AI로 사용'}</Button>
    </>}
    <p className="text-xs leading-5 text-muted-foreground">기존 API 설정은 삭제하지 않습니다. 텍스트·JSON·스트리밍·취소를 공통 인터페이스로 처리하지만 temperature·출력 토큰 상한 등은 Codex의 지원 범위를 따릅니다. 이미지 생성·임베딩은 기존 별도 제공자를 사용합니다. Ghost Text는 지연과 구독 한도를 고려해 로컬 전용 설정을 유지하는 것을 권장합니다.</p>
    {message && <p className="text-sm" role="status">{message}</p>}
  </section>;
}
