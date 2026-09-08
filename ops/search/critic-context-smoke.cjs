'use strict';

// Read-only check against an explicitly mounted project DB and its configured
// inference API. Never approves suggestions or writes manuscript content.
const path = require('node:path');
const Database = require('better-sqlite3');

async function main() {
  if (process.env.SKIP_DATABASE_MIGRATIONS !== '1') throw new Error('Run with migrations disabled and a read-only data mount.');
  const db = new Database(process.env.DATABASE_URL, { readonly: true });
  const chapter = db.prepare('SELECT id, project_id, content_json FROM chapters WHERE content_json IS NOT NULL ORDER BY updated_at DESC LIMIT 1').get();
  if (!chapter) throw new Error('No manuscript found');
  const nativeFetch = global.fetch;
  const diagnostics = [];
  global.fetch = async (url, init) => {
    const response = await nativeFetch(url, init);
    if (String(url).includes('/chat/completions') && response.ok) {
      const body = await response.clone().json();
      try {
        const content = JSON.parse(body.choices[0].message.content);
        diagnostics.push(content.decisions ? { decisions: content.decisions } : { generated: content.suggestions?.length });
      } catch { diagnostics.push({ incomplete: true }); }
    }
    return response;
  };
  const api = require(path.join(process.cwd(), '.next/server/app/api/projects/[id]/manuscript-critic/route.js')).routeModule.userland;
  const start = Date.now();
  const response = await api.POST(new Request('http://localhost/api/test', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterId: chapter.id, currentContentJson: chapter.content_json, intensity: 'bold' }),
    signal: AbortSignal.timeout(180000),
  }), { params: Promise.resolve({ id: chapter.project_id }) });
  const result = await response.json();
  console.log(JSON.stringify({ status: response.status, ms: Date.now() - start,
    qualityReview: result.qualityReview, summary: result.summary, diagnostics,
    suggestions: result.suggestions?.map(({ original, replacement, reason }) => ({ original, replacement, reason })) }));
  db.close();
  if (response.status !== 200 || result.qualityReview?.status !== 'checked') throw new Error('Critic comparison did not complete');
}
main().catch((error) => { console.error(error.name); process.exitCode = 1; });
