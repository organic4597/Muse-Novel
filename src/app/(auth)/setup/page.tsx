import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { SetupForm } from '@/components/auth/setup-form';
import { sanitizeReturnTo } from '@/lib/auth/redirect';
import { getCurrentSession } from '@/lib/auth/server';
import { isAuthConfigured } from '@/lib/auth/service';
import { isSetupTokenRequired } from '@/lib/auth/setup-token';

export const dynamic = 'force-dynamic';

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(
    typeof params.returnTo === 'string' ? params.returnTo : undefined
  );
  if (await isAuthConfigured()) {
    redirect((await getCurrentSession()) ? returnTo : '/login');
  }

  return (
    <AuthCard
      description="이 설정은 최초 한 번만 진행합니다. 앞으로 Muse Novel에 접속할 때 사용할 단일 관리자 계정을 만들어 주세요."
      eyebrow="First-run security"
      title="작업실을 잠가둘게요"
    >
      <SetupForm returnTo={returnTo} setupTokenRequired={isSetupTokenRequired()} />
    </AuthCard>
  );
}
