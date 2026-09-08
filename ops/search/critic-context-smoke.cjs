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
  const badCandidateTest = process.env.CRITIC_BAD_CANDIDATE_TEST === '1';
  const quote = '정파 놈들이 먼저 산맥 초입에 접근했다고 하네.';
  const fixture = `무림인들의 목소리가 들려왔다.\n"${quote}"\n"사파도 만만치 않을 테지."\n곽진봉은 그들의 대화를 엿듣고 그림자 속으로 몸을 숨겼다. 아직 그의 존재를 알아챈 사람은 없었다.\n밤이 깊어지자 그는 흉터의 통증을 참았다.`;
  const nativeFetch = global.fetch;
  const diagnostics = [];
  global.fetch = async (url, init) => {
    const requestBody = init?.body ? JSON.parse(String(init.body)) : {};
    if (badCandidateTest && requestBody.response_format?.json_schema?.name === 'manuscript_critic_report') {
      return Response.json({ id: 'critic-fixture', model: requestBody.model, created: 1,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({
          summary: '군중의 대화를 엿듣는 장면입니다.', sceneNotes: [], suggestions: [{
            category: 'dialogue', scope: 'sentence', confidence: 0.99, original: quote,
            replacement: `${quote} 곽진봉은 속으로 되뇌었다. 냉기가 손끝을 타고 올라왔다. 흉터의 통증이 스몄다.`,
            reason: '감각을 추가하면 더 생생해집니다.',
          }],
        }) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
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
    body: JSON.stringify({ chapterId: chapter.id,
      currentContentJson: badCandidateTest ? JSON.stringify(fixture.split('\n').map(text => ({ type: 'p', children: [{ text }] }))) : chapter.content_json,
      intensity: 'bold' }),
    signal: AbortSignal.timeout(180000),
  }), { params: Promise.resolve({ id: chapter.project_id }) });
  const result = await response.json();
  console.log(JSON.stringify({ status: response.status, ms: Date.now() - start,
    qualityReview: result.qualityReview, summary: result.summary, diagnostics,
    suggestions: result.suggestions?.map(({ original, replacement, reason }) => ({ original, replacement, reason })) }));
  db.close();
  if (response.status !== 200 || result.qualityReview?.status !== 'checked') throw new Error('Critic comparison did not complete');
  if (badCandidateTest && (result.qualityReview.evaluated !== 1 || result.suggestions.length !== 0)) throw new Error('Bad dialogue expansion was not rejected');
}
main().catch((error) => { console.error(error.name); process.exitCode = 1; });
