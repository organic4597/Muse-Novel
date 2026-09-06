import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import defaults from '../../../knowledge/web-research/sources.json';

const sourceSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  url: z.string().url().refine((value) => ['https:', 'http:'].includes(new URL(value).protocol)),
  searchSite: z.string().max(150).regex(/^[a-z0-9.-]+(?:\/[a-z0-9_/-]*)?$/i),
  queryHint: z.string().max(50).optional(),
  kind: z.string().max(60),
  topics: z.string().max(300),
  note: z.string().max(400),
  enabled: z.boolean().optional(),
});
const catalogSchema = z.array(sourceSchema).max(40);
export type WebReferenceSite = z.infer<typeof sourceSchema>;
let cached: { path: string; expires: number; sites: WebReferenceSite[] } | undefined;

export async function loadWebReferenceSites(): Promise<WebReferenceSite[]> {
  const filePath = process.env.WEB_RESEARCH_SOURCES_PATH || path.join(process.cwd(), 'knowledge/web-research/sources.json');
  if (cached?.path === filePath && cached.expires > Date.now()) return cached.sites;
  let sites = catalogSchema.parse(defaults);
  try {
    // Optional runtime configuration is operator-mounted; Docker copies bundled defaults explicitly.
    const metadata = await stat(/* turbopackIgnore: true */ filePath);
    if (metadata.size <= 64_000) {
      const raw = await readFile(/* turbopackIgnore: true */ filePath, 'utf8');
      sites = catalogSchema.parse(JSON.parse(raw));
    }
  } catch {
    // Keep the bundled reference list when an optional operator override is invalid.
  }
  const enabled = sites.filter((site) => site.enabled !== false);
  cached = { path: filePath, expires: Date.now() + 30_000, sites: enabled };
  return enabled;
}

export function identifyWebReference(url: string, sites: WebReferenceSite[]) {
  const candidate = new URL(url);
  return sites.find((site) => {
    const expected = new URL(`https://${site.searchSite}`);
    return (candidate.hostname === expected.hostname || candidate.hostname.endsWith(`.${expected.hostname}`)) &&
      (expected.pathname === '/' || candidate.pathname === expected.pathname || candidate.pathname.startsWith(`${expected.pathname.replace(/\/$/, '')}/`));
  });
}
