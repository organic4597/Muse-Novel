// Run from /app in the built image with --network none and DATABASE_URL=/tmp/entity-revision-smoke.db.
// Uses an in-container mock inference API and an isolated disposable database, never user data.
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const Database = appRequire('better-sqlite3');
let inferenceCalls = 0;
const server = http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body);
  const system = input.messages.find((message) => message.role === 'system').content;
  const changes = system.includes('personality') ? { personality: '친절하지만 경계심이 있는 성격' } : { content: '기존 배경. 명예장로 설정 추가.' };
  inferenceCalls += 1;
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ id: 'mock', object: 'chat.completion', created: 1, model: 'mock-local',
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ changes, note: '요청 부분만 보강' }) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }));
});
async function main() {
  assert.equal(process.env.DATABASE_URL, '/tmp/entity-revision-smoke.db');
  await new Promise((resolve) => server.listen(4011, '127.0.0.1', resolve));
  const edit = appRequire(path.join(process.cwd(), '.next/server/app/api/projects/[id]/entity-edits/[kind]/[entityId]/route.js')).routeModule.userland;
  const world = appRequire(path.join(process.cwd(), '.next/server/app/api/projects/[id]/world-entries/[entryId]/route.js')).routeModule.userland;
  const character = appRequire(path.join(process.cwd(), '.next/server/app/api/projects/[id]/characters/[characterId]/route.js')).routeModule.userland;
  const projectId = crypto.randomUUID();
  const worldId = crypto.randomUUID();
  const characterId = crypto.randomUUID();
  const request = (body, suffix = '') => new Request(`http://localhost/api/test${suffix}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const context = (kind, entityId) => ({ params: Promise.resolve({ id: projectId, kind, entityId }) });
  assert.equal((await edit.GET(request(), context('world', worldId))).status, 404);
  const db = new Database(process.env.DATABASE_URL);
  db.prepare('INSERT INTO projects(id,title,genre) VALUES(?,?,?)').run(projectId, '격리 검증 작품', '무협');
  db.prepare('INSERT INTO world_entries(id,project_id,title,category,content) VALUES(?,?,?,?,?)').run(worldId, projectId, '소림사', '장소', '기존 배경.');
  db.prepare('INSERT INTO characters(id,project_id,name,personality,image_path) VALUES(?,?,?,?,?)').run(characterId, projectId, '검은 토끼', '친절함', '/uploads/original.png');
  db.prepare('INSERT INTO ai_provider_settings(id,project_id,provider_type,model_name,base_url,is_default) VALUES(?,?,?,?,?,1)')
    .run(crypto.randomUUID(), projectId, 'openai-compatible', 'mock-local', 'http://127.0.0.1:4011');

  for (const [kind, entityId, field] of [['world', worldId, 'content'], ['character', characterId, 'personality']]) {
    const ctx = context(kind, entityId);
    const initial = await (await edit.GET(request(), ctx)).json();
    const proposedResponse = await edit.POST(request({ action: 'propose', instruction: '기존 설정을 유지하고 요청한 부분만 보강해줘', webSearchMode: 'off' }), ctx);
    const proposal = await proposedResponse.json();
    assert.equal(proposedResponse.status, 200, JSON.stringify(proposal));
    assert.equal((await (await edit.GET(request(), ctx)).json()).version, initial.version);
    assert.equal(db.prepare('SELECT count(*) AS n FROM entity_revisions WHERE entity_id=?').get(entityId).n, 0);
    const appliedResponse = await edit.POST(request({ action: 'apply', changes: proposal.changes, baseVersion: proposal.baseVersion }), ctx);
    assert.equal(appliedResponse.status, 200);
    const applied = await appliedResponse.json();
    assert.notEqual(applied.snapshot[field], initial.snapshot[field]);
    const history = await (await edit.GET(request(), ctx)).json();
    assert.equal(history.revisions.length, 1);
    const preview = await (await edit.GET(request(undefined, `?revisionId=${history.revisions[0].id}`), ctx)).json();
    const restoredResponse = await edit.POST(request({ action: 'restore', revisionId: history.revisions[0].id, baseVersion: preview.baseVersion }), ctx);
    assert.equal(restoredResponse.status, 200);
    const restored = await restoredResponse.json();
    assert.equal(restored.snapshot[field], initial.snapshot[field]);
    assert.equal((await (await edit.GET(request(), ctx)).json()).revisions.length, 2);
    assert.equal((await edit.POST(request({ action: 'apply', changes: proposal.changes, baseVersion: initial.version }), ctx)).status, 409);
    const otherContext = context(kind === 'world' ? 'character' : 'world', kind === 'world' ? characterId : worldId);
    assert.equal((await edit.GET(request(undefined, `?revisionId=${history.revisions[0].id}`), otherContext)).status, 404);
    const manualRoute = kind === 'world' ? world : character;
    const manualContext = { params: Promise.resolve({ id: projectId, entryId: worldId, characterId }) };
    assert.equal((await manualRoute.PUT(request({ [field]: null }), manualContext)).status, 200);
    const manuallyCleared = await (await edit.GET(request(), ctx)).json();
    assert.equal(manuallyCleared.snapshot[field], null);
    assert.equal(manuallyCleared.revisions.length, 3);
    assert.equal((await manualRoute.PUT(request({ [field]: '다른 작품에서의 변경' }), { params: Promise.resolve({ id: crypto.randomUUID(), entryId: worldId, characterId }) })).status, 404);
  }
  assert.equal(inferenceCalls, 2);
  assert.equal(db.prepare('SELECT image_path FROM characters WHERE id=?').get(characterId).image_path, '/uploads/original.png');
  assert.equal(db.prepare('SELECT count(*) AS n FROM world_entries').get().n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM characters').get().n, 1);
  db.close();
  console.log(JSON.stringify({ ok: true, inference: 'mock', kinds: ['character', 'world'], draftDoesNotSave: true, approveRestoreManualHistory: true, conflictsRejected: true, crossEntityRestoreRejected: true, mediaPreserved: true }));
}
main().then(() => { server.close(); process.exit(0); }).catch((error) => { console.error(error); server.close(); process.exit(1); });
