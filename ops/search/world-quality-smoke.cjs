// Run from /app in an isolated Muse image with --network none and a fresh /tmp database.
// Both inference and search are local fixtures. Never mount production data for this test.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const Database = appRequire('better-sqlite3');
const groups = [
  { label: '오대세가', expectedCount: 5, members: ['남궁세가', '모용세가', '제갈세가', '사천당가', '하북팽가'] },
  { label: '구파일방', expectedCount: 10, members: ['소림사', '무당파', '화산파', '종남파', '아미파', '곤륜파', '공동파', '청성파', '점창파', '개방'] },
];
const events = [];
const fixture = http.createServer(async (request, response) => {
  try {
    let body = '';
    for await (const chunk of request) body += chunk;
    let output;
    if (request.url === '/search') {
      events.push('search');
      output = { results: groups.map((group, index) => ({
        title: `${group.label} 구성`, url: `https://example.org/group${index}`,
        content: `${group.label} 구성: ${group.members.join(', ')}. 기본 정보 참고 자료입니다.`,
      })) };
    } else {
      assert.equal(request.url, '/v1/chat/completions');
      const input = JSON.parse(body);
      const system = input.messages.find((message) => message.role === 'system').content;
      const prompt = input.messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n');
      let value;
      if (system.includes('세계관 생성 요청 분석가')) {
        events.push('analyze');
        // Deliberately exceed the search budget to reproduce the reported model-output error.
        value = { taskSummary: '오대세가와 구파일방의 개별 구성원을 기본 정보와 함께 정리한다.', lookupQueries: ['오대세가 구성', '구파일방 구성', '무협 문파 특징'] };
      } else if (system.includes('개별 항목을 추출')) {
        events.push('roster');
        value = prompt.includes('<untrusted_web_search_results>') ? { groups } : { needsSearch: true, groups: [] };
      } else if (system.includes('요청 이행 검토자')) {
        events.push('verify');
        value = { valid: true, expectedCount: 15, issues: [] };
      } else {
        events.push('details');
        const targets = JSON.parse(prompt.match(/<targets>\n([\s\S]*?)\n<\/targets>/)[1]);
        value = { entries: targets.map(({ title }) => ({ title, category: '종파',
          content: `${title}의 기본 정보를 정리한 테스트용 설명입니다. 실제 역사나 장르의 사실을 검증하는 테스트는 아닙니다.`,
          tags: ['검토'], sourceIds: ['웹1', '웹2'] })) };
      }
      output = { id: 'mock-completion', object: 'chat.completion', created: 1, model: 'mock-local',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(value) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } };
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(output));
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});

async function main() {
  assert.equal(process.env.DATABASE_URL, '/tmp/world-quality-smoke.db');
  await new Promise((resolve) => fixture.listen(4010, '127.0.0.1', resolve));
  process.env.WEB_SEARCH_URL = 'http://127.0.0.1:4010';
  const assistant = appRequire(path.join(process.cwd(), '.next/server/app/api/projects/[id]/world-entries/assistant/route.js')).routeModule.userland;
  const review = appRequire(path.join(process.cwd(), '.next/server/app/api/projects/[id]/world-entries/assistant/review/route.js')).routeModule.userland;
  const projectId = crypto.randomUUID();
  const params = { params: Promise.resolve({ id: projectId }) };
  // Initialize the compiled route's lazy database/migrations before seeding.
  assert.equal((await assistant.GET(new Request('http://localhost/api/test'), params)).status, 404);
  const db = new Database(process.env.DATABASE_URL);
  db.prepare('INSERT INTO projects(id,title,genre) VALUES(?,?,?)').run(projectId, '격리 검증 작품', '무협');
  db.prepare('INSERT INTO ai_provider_settings(id,project_id,provider_type,model_name,base_url,is_default) VALUES(?,?,?,?,?,1)')
    .run(crypto.randomUUID(), projectId, 'openai-compatible', 'mock-local', 'http://127.0.0.1:4010');
  const makeRequest = (body) => new Request('http://localhost/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await assistant.POST(makeRequest({ instruction: '5대세가와 9파 1방을 기본 정보와 함께 추가해줘', webSearchMode: 'auto' }), params);
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.suggestions.length, 15);
  assert.equal(data.report.requestedCount, 15);
  assert.deepEqual(data.report.missingTitles, []);
  assert.deepEqual(events.slice(0, 6), ['analyze', 'roster', 'search', 'search', 'roster', 'verify']);
  assert.equal(db.prepare('SELECT count(*) AS n FROM world_entries').get().n, 0);
  assert(data.suggestions.every((entry) => entry.sourceIds.length === 1 && !entry.content.includes('https://')));
  const approveBody = { action: 'approve', suggestionIds: [data.suggestions[0].id] };
  assert.equal((await review.POST(makeRequest(approveBody), params)).status, 200);
  assert.equal((await review.POST(makeRequest(approveBody), params)).status, 200);
  assert.equal((await review.POST(makeRequest({ action: 'reject', suggestionIds: [data.suggestions[1].id] }), params)).status, 200);
  const canon = db.prepare('SELECT content,research_json FROM world_entries').all();
  assert.equal(canon.length, 1);
  assert.equal(JSON.parse(canon[0].research_json).sources.length, 1);
  assert(!canon[0].content.includes('https://'));
  const restored = await (await assistant.GET(new Request('http://localhost/api/test'), params)).json();
  assert.equal(restored.suggestions.length, 13);
  assert.equal(restored.suggestions[0].report.requestedCount, 15);
  db.close();
  console.log(JSON.stringify({ ok: true, inference: 'mock', generated: 15, canonAfterApproveRetry: 1, pendingAfterReject: 13, events }));
}

main().then(() => { fixture.close(); process.exit(0); }).catch((error) => { console.error(error); fixture.close(); process.exit(1); });
