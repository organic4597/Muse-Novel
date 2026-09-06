// Run in the production image with --network none and DATABASE_URL=/tmp/category-rename-smoke.db.
// No production volume or user data is used.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const Database = appRequire('better-sqlite3');

async function main() {
  assert.equal(process.env.DATABASE_URL, '/tmp/category-rename-smoke.db');
  const route = appRequire(path.join(process.cwd(), '.next/server/app/api/projects/[id]/world-categories/route.js')).routeModule.userland;
  const projectId = crypto.randomUUID();
  const params = { params: Promise.resolve({ id: projectId }) };
  const request = (body) => new Request('http://localhost/api/test', { method: 'PATCH', body: JSON.stringify(body) });
  assert.equal((await route.GET(request({}), params)).status, 404);
  const db = new Database(process.env.DATABASE_URL);
  db.prepare('INSERT INTO projects(id,title) VALUES(?,?)').run(projectId, '격리 테스트');
  const entryId = crypto.randomUUID();
  db.prepare('INSERT INTO world_entries(id,project_id,category,title,content) VALUES(?,?,?,?,?)').run(entryId, projectId, '장소', '성', '보존할 본문');
  db.prepare('INSERT INTO world_entry_suggestions(id,project_id,batch_id,category,title,tags_json,status) VALUES(?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), projectId, crypto.randomUUID(), '장소', '마을', '[]', 'pending');
  const renamed = await route.PATCH(request({ oldName: '장소', name: '지역' }), params);
  const data = await renamed.json();
  assert.equal(renamed.status, 200, JSON.stringify(data));
  assert.equal(data.updatedEntries, 1);
  assert.equal(data.updatedSuggestions, 1);
  assert.deepEqual(db.prepare('SELECT category,content FROM world_entries WHERE id=?').get(entryId), { category: '지역', content: '보존할 본문' });
  assert.equal((await route.PATCH(request({ oldName: '지역', name: '물건' }), params)).status, 409);
  const oldCreate = await (await route.POST(request({ name: '장소' }), params)).json();
  assert.equal(oldCreate.name, '지역');
  const restored = await (await route.GET(request({}), params)).json();
  assert.equal(restored.length, 1);
  assert.deepEqual(JSON.parse(restored[0].aliasesJson), ['장소']);
  assert.equal((await route.PATCH(request({ oldName: '지역', name: '장소' }), params)).status, 200);
  assert.equal(db.prepare('SELECT category FROM world_entries WHERE id=?').get(entryId).category, '장소');
  const deleted = await route.DELETE(request({ name: '장소', targetName: '기타' }), params);
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).updatedEntries, 1);
  assert.equal((await route.DELETE(request({ name: '장소', targetName: '기타' }), params)).status, 200);
  assert.deepEqual(db.prepare('SELECT category,content FROM world_entries WHERE id=?').get(entryId), { category: '기타', content: '보존할 본문' });
  assert.equal(db.prepare('SELECT category FROM world_entry_suggestions').get().category, '기타');
  assert.equal((await (await route.POST(request({ name: '지역' }), params)).json()).name, '기타');
  assert.equal((await route.DELETE(request({ name: '기타', targetName: '기타' }), params)).status, 409);
  db.close();
  console.log(JSON.stringify({ ok: true, movedEntries: 1, movedCandidates: 1, collisionRejected: true, staleNameResolved: true, renameBack: true, deletePreservesContent: true, deleteRetrySafe: true }));
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
