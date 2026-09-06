'use client';

import { LoaderCircle, LogIn } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
          returnTo,
        }),
      });
      const result = (await response.json()) as {
        code?: string;
        error?: string;
        redirectTo?: string;
      };
      if (result.code === 'AUTH_SETUP_REQUIRED') {
        window.location.assign('/setup');
        return;
      }
      if (!response.ok) {
        setError(result.error ?? '로그인하지 못했습니다.');
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
      action="/api/auth/login"
      className="space-y-5"
      method="post"
      onSubmit={handleSubmit}
    >
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor="username">
          아이디
        </label>
        <Input
          autoCapitalize="none"
          autoComplete="username"
          autoFocus
          disabled={pending}
          id="username"
          maxLength={64}
          name="username"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="font-medium text-sm" htmlFor="password">
          비밀번호
        </label>
        <Input
          autoComplete="current-password"
          disabled={pending}
          id="password"
          maxLength={256}
          name="password"
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
        {pending ? <LoaderCircle className="animate-spin" /> : <LogIn />}
        {pending ? '확인하는 중…' : '로그인'}
      </Button>
    </form>
  );
}
