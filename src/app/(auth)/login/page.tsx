import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';
import { sanitizeReturnTo } from '@/lib/auth/redirect';
import { getCurrentSession } from '@/lib/auth/server';
import { isAuthConfigured } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(
    typeof params.returnTo === 'string' ? params.returnTo : undefined
  );
  if (!(await isAuthConfigured())) {
    redirect(`/setup${returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`);
  }
  if (await getCurrentSession()) {
    redirect(returnTo);
  }

  return (
    <AuthCard
      description="내 서재와 집필 설정을 보호하기 위해 관리자 계정으로 로그인해 주세요."
      eyebrow="Private writing studio"
      title="다시 오셨군요"
    >
      <LoginForm returnTo={returnTo} />
    </AuthCard>
  );
}
