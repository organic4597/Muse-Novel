import { z } from 'zod';

export const MAX_RESEARCH_QUERIES = 2;
const unsafeQuery = /(?:https?:\/\/|[\w.+-]+@[\w.-]+|\bsk-[\w-]+|bearer\s|api[_ -]?key|password|비밀번호|인증코드|\b\d{8,}\b)/i;

/** Model output is a proposal. Normalize it before enforcing the server's search budget. */
export const researchQueriesSchema = z.preprocess((value) => {
  if (value == null) return [];
  if (!Array.isArray(value)) return value; // Do not reinterpret arbitrary objects or manuscript text.
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const candidate of value.slice(0, 32)) {
    if (typeof candidate !== 'string') continue;
    const query = candidate.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const key = query.toLocaleLowerCase();
    if (query.length < 2 || query.length > 100 || unsafeQuery.test(query) || seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length === MAX_RESEARCH_QUERIES) break;
  }
  return queries;
}, z.array(z.string().min(2).max(100)).max(MAX_RESEARCH_QUERIES));

export const researchPlanSchema = z.object({
  queries: researchQueriesSchema,
  sourceId: z.string().max(50).optional(),
});
