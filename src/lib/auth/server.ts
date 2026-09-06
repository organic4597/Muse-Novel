import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE_NAME } from './constants';
import { isAuthConfigured } from './service';
import { validateSessionToken } from './session';

export async function getCurrentSession() {
  const cookieStore = await cookies();
  return validateSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function requirePageSession(): Promise<void> {
  if (!(await isAuthConfigured())) {
    redirect('/setup');
  }
  if (!(await getCurrentSession())) {
    redirect('/login');
  }
}
