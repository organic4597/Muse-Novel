'use client';

import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function SetupForm({
  returnTo,
  setupTokenRequired,
}: {
  returnTo: string;
  setupTokenRequired: boolean;
}) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const passwordConfirmation = String(form.get('passwordConfirmation') ?? '');
    if (password !== passwordConfirmation) {
      setError('비밀번호가 서로 일치하지 않습니다.');
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.get('username'),
          password,
          setupToken: form.get('setupToken'),
          returnTo,
        }),
      });
      const result = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok) {
        setError(result.error ?? '관리자 설정을 완료하지 못했습니다.');
        return;
      }
      window.location.assign(result.redirectTo ?? '/');
    } catch {
      setError('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      action="/api/auth/setup"
      className="space-y-5"
      method="post"
      onSubmit={handleSubmit}
    >
      {setupTokenRequired ? (
        <div className="space-y-2">
          <label className="font-medium text-sm" htmlFor="setupToken">
            초기 설정 코드
          </label>
          <Input
            aria-describedby="setup-token-hint"
            autoComplete="off"
            disabled={pending}
            id="setupToken"
            maxLength={256}
            name="setupToken"
            required
            type="password"
          />
          <p className="text-muted-foreground text-xs leading-5" id="setup-token-hint">
            서버를 배포할 때 지정한 일회성 초기 설정 코드를 입력하세요.
          </p>
        </div>
      ) : null}
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor="username">
          관리자 아이디
        </label>
        <Input
          autoCapitalize="none"
          autoComplete="username"
          autoFocus
          defaultValue="admin"
          disabled={pending}
          id="username"
          maxLength={64}
          minLength={2}
          name="username"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor="password">
          비밀번호
        </label>
        <Input
          aria-describedby="password-hint"
          autoComplete="new-password"
          disabled={pending}
          id="password"
          maxLength={256}
          minLength={12}
          name="password"
          required
          type="password"
        />
        <p className="text-muted-foreground text-xs leading-5" id="password-hint">
          12자 이상의 고유한 비밀번호를 사용하세요. 비밀번호는 복구할 수 없습니다.
        </p>
      </div>
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor="passwordConfirmation">
          비밀번호 확인
        </label>
        <Input
          autoComplete="new-password"
          disabled={pending}
          id="passwordConfirmation"
          maxLength={256}
          minLength={12}
          name="passwordConfirmation"
          required
          type="password"
        />
      </div>
      {error ? (
        <p className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <Button className="w-full" disabled={pending} size="lg" type="submit">
        {pending ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
        {pending ? '안전하게 저장하는 중…' : '관리자 설정 완료'}
      </Button>
      <p className="text-center text-muted-foreground text-xs leading-5">
        비밀번호는 원문으로 저장하지 않고, 개별 무작위 솔트와 scrypt로 보호합니다.
      </p>
    </form>
  );
}
