'use strict';

// Isolated /tmp SQLite, synthetic prose and an explicitly configured inference
// URL. Never mount production data for this test.
const assert = require('node:assert/strict');
const path = require('node:path');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const route = name => require(path.join(process.cwd(), `.next/server/app/api/${name}/route.js`)).routeModule.userland;

async function result(response) {
  if (!response.headers.get('content-type').includes('text/event-stream')) {
    const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
  }
  const reader = response.body.getReader();
  let buffer = ''; let final;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split('\n\n'); buffer = blocks.pop();
    for (const block of blocks) {
      const lines = block.split('\n');
      const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
      const raw = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5)).join('\n');
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (event === 'error') throw new Error(data.message);
      if (event === 'progress') console.log(JSON.stringify({ progress: data.message }));
      if (event === 'done') final = data;
    }
    if (done) break;
  }
  assert(final); return final;
}
async function main() {
  assert.equal(process.env.DATABASE_URL, '/tmp/editorial-workbench-smoke.db');
  assert(process.env.SMOKE_MODEL_BASE_URL);
  const workbench = route('projects/[id]/writing-workbench');
  const projectId = crypto.randomUUID(), chapterId = crypto.randomUUID();
  const params = { params: Promise.resolve({ id: projectId }) };
  await workbench.GET(new Request('http://localhost/api/test'), params);
  const db = new Database(process.env.DATABASE_URL);
  const prose = '그는 문을 열었다. 그는 안으로 들어갔다.\n방 안에는 아무도 없었다. 책상에는 봉투 하나가 놓여 있었다. 그는 봉투를 열지 않고 창밖을 살폈다.\n골목에 서 있던 사내가 고개를 들었다. 그는 재빨리 창문 옆으로 몸을 숨겼다.';
  const content = JSON.stringify(prose.split('\n').map(text => ({ type: 'p', children: [{ text }] })));
  db.prepare('INSERT INTO projects(id,title,genre) VALUES(?,?,?)').run(projectId, '격리 편집 검증', '미스터리');
  db.prepare('INSERT INTO chapters(id,project_id,title,"order",content_json,outline) VALUES(?,?,?,?,?,?)').run(chapterId, projectId, '수색', 0, content, '주인공이 방을 수색하다 미행을 알아챈다. 봉투의 내용은 아직 숨긴다.');
  db.prepare('INSERT INTO ai_provider_settings(id,project_id,provider_type,model_name,base_url,is_default) VALUES(?,?,?,?,?,1)').run(crypto.randomUUID(), projectId, 'qwen-local', process.env.SMOKE_MODEL_ID || 'local', process.env.SMOKE_MODEL_BASE_URL);
  const post = body => workbench.POST(new Request('http://localhost/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body) }), params).then(result);
  const generated = await post({ action: 'draft-scene', chapterId, currentContentJson: content });
  assert(generated.plan.goal !== undefined);
  assert.equal(db.prepare('SELECT count(*) n FROM writing_scenes').get().n, 0);
  const scene = await post({ action: 'save-scene', chapterId, title: '수색', status: 'confirmed', plan: generated.plan });
  await post({ action: 'save-example', example: { kind: 'edit', verdict: 'accepted', title: '반복 주어 압축', original: '그는 문을 열었다. 그는 안으로 들어갔다.', replacement: '그는 문을 열고 안으로 들어갔다.', reason: '연속 행동의 주어 반복을 합친다.' } });
  const diagnosis = await post({ action: 'diagnose', chapterId, sceneId: scene.id, currentContentJson: content });
  assert(diagnosis.snapshot);
  const goal = { original: '그는 문을 열었다. 그는 안으로 들어갔다.', action: 'compress', issue: '주어 반복', objective: '두 행동과 순서를 유지하며 반복 주어만 압축한다.' };
  const edits = await post({ action: 'rewrite', chapterId, sceneId: scene.id, currentContentJson: content, snapshot: diagnosis.snapshot, goals: [goal], supplement: '' });
  assert.equal(edits.qualityReview.status, 'checked');
  assert.equal(db.prepare('SELECT content_json FROM chapters WHERE id=?').get(chapterId).content_json, content);
  const ghost = route('ai/copilot');
  const ghostBody = { projectId, chapterId, sceneId: scene.id, mode: 'inline-suggestion', trigger: 'explicit', prefix: '복도에는 아무도 없었다. 그는 조심스럽게 문을 열고 ', suffix: '' };
  const ghostResult = await ghost.POST(new Request('http://localhost/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ghostBody) })).then(result);
  console.log(JSON.stringify({ ok: true, goals: diagnosis.goals.map(item => ({ action: item.action, objective: item.objective })),
    quality: edits.qualityReview, rewrites: edits.suggestions.map(item => item.replacement), ghost: ghostResult.text, sourceUnchanged: true }));
  db.close();
}
main().catch(error => { console.error(error.name, error.message); process.exitCode = 1; });
