import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { FullConfig } from '@playwright/test';

import { E2E_AUTH_DATA_DIR, E2E_AUTH_STATE_PATH } from './helpers/auth';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const authRoot = path.dirname(E2E_AUTH_DATA_DIR);
  const expectedParent = path.resolve('test-results');
  const relativeAuthRoot = path.relative(expectedParent, authRoot);

  if (relativeAuthRoot.startsWith('..') || path.isAbsolute(relativeAuthRoot)) {
    throw new Error('Refusing to reset Playwright auth data outside test-results');
  }

  await rm(authRoot, { force: true, recursive: true });
  await mkdir(path.dirname(E2E_AUTH_STATE_PATH), { recursive: true });
}
