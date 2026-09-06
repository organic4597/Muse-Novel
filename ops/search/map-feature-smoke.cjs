'use strict';
// Run in a built Muse image with isolated DATABASE_URL/UPLOADS_DIR. No user data or network.
const assert = require('node:assert/strict');
const { access } = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const Database = appRequire('better-sqlite3');
const sharp = appRequire('sharp');
const load = async (route) => {
  const module = appRequire(path.join(process.cwd(), `.next/server/app/api/projects/[id]/${route}/route.js`)).routeModule;
  if (module.ensureUserland) await module.ensureUserland();
  return module.userland;
};
const request = (body, url = 'http://localhost/api/test', method = 'POST') => new Request(url, body instanceof FormData ? { method, body } : body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const context = (projectId, extra = {}) => ({ params: Promise.resolve({ id: projectId, ...extra }) });
async function image(name, color = '#aabbcc') {
  const bytes = await sharp({ create: { width: 1200, height: 700, channels: 3, background: color } }).png().toBuffer();
  const form = new FormData(); form.set('name', name); form.set('image', new File([bytes], `${name}.png`, { type: 'image/png' })); return form;
}
async function main() {
  const [mapsRoute, mapRoute, worldRoute, projectRoute, entityRoute] = await Promise.all([
    load('maps'), load('maps/[mapId]'), load('world-entries/[entryId]'), load(''), load('maps/entity'),
  ]);
  assert.equal(process.env.DATABASE_URL, '/tmp/map-feature-smoke.db');
  assert.equal(process.env.UPLOADS_DIR, '/tmp/map-feature-smoke-uploads');
  const projectId = crypto.randomUUID(); const ctx = context(projectId);
  assert.equal((await mapsRoute.GET(request(), ctx)).status, 404); // initialize migrations
  const db = new Database(process.env.DATABASE_URL); db.pragma('foreign_keys=ON');
  db.prepare('INSERT INTO projects(id,title) VALUES(?,?)').run(projectId, '지도 격리 검증');
  const entryId = crypto.randomUUID(); const characterId = crypto.randomUUID();
  db.prepare('INSERT INTO world_entries(id,project_id,title,category,content) VALUES(?,?,?,?,?)').run(entryId, projectId, '왕국', '장소', '왕국의 전체 설정');
  db.prepare('INSERT INTO characters(id,project_id,name,role,backstory) VALUES(?,?,?,?,?)').run(characterId, projectId, '기사', '조연', '기사의 전체 설정');
  const paletteResponse = await mapsRoute.POST(request({ action: 'palette-add', color: '#ef233c' }), ctx);
  assert.equal(paletteResponse.status, 200); assert.deepEqual((await paletteResponse.json()).palette, ['#ef233c']);
  assert.equal((await mapsRoute.POST(request({ action: 'palette-add', color: '#ef233c' }), ctx)).status, 409);
  const createMap = async (name, color) => {
    const response = await mapsRoute.POST(request(await image(name, color)), ctx); const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data)); return data.map;
  };
  const first = await createMap('대륙', '#aabbcc'); const second = await createMap('도시', '#ccbbaa');
  for (const map of [first, second]) {
    assert.equal(map.width, 1200); assert.equal(map.height, 700);
    for (const file of [map.imagePath, map.image2xPath, map.thumbnailPath]) await access(path.join(process.env.UPLOADS_DIR, file.slice('/uploads/'.length)));
  }
  const folderResponse = await mapsRoute.POST(request({ action: 'folder-create', name: '대륙 지도' }), ctx);
  const folder = (await folderResponse.json()).folders[0]; assert.equal(folderResponse.status, 200);
  assert.equal((await mapRoute.PATCH(request({ folderId: folder.id }, undefined, 'PATCH'), context(projectId, { mapId: first.id }))).status, 200);
  const removedFolder = await mapsRoute.POST(request({ action: 'folder-delete', folderId: folder.id }), ctx);
  assert.equal((await removedFolder.json()).maps.find((map) => map.id === first.id).folderId, null);
  const duplicatePins = [
    { id: crypto.randomUUID(), kind: 'world', targetId: entryId, label: '왕국', status: 'active', flagColor: '#ef233c', x: 0.2, y: 0.3 },
    { id: crypto.randomUUID(), kind: 'world', targetId: entryId, label: '왕국', status: 'inactive', x: 0.7, y: 0.6 },
    { id: crypto.randomUUID(), kind: 'character', targetId: characterId, label: '기사', status: 'active', x: 0.4, y: 0.5 },
    { id: crypto.randomUUID(), kind: 'terrain', targetId: second.id, label: '도시', status: 'active', x: 0.5, y: 0.5 },
  ];
  const savedResponse = await mapRoute.PUT(request({ revision: 1, pins: duplicatePins }, undefined, 'PUT'), context(projectId, { mapId: first.id }));
  const saved = await savedResponse.json(); assert.equal(savedResponse.status, 200, JSON.stringify(saved)); assert.equal(saved.pins.length, 4); assert.equal(saved.map.revision, 2);
  assert.equal(saved.pins.some((pin) => pin.flagColor === '#ef233c'), true);
  const reverse = [{ id: crypto.randomUUID(), kind: 'terrain', targetId: first.id, label: '대륙', status: 'active', x: 0.5, y: 0.5 }];
  const cycleResponse = await mapRoute.PUT(request({ revision: 1, pins: reverse }, undefined, 'PUT'), context(projectId, { mapId: second.id }));
  assert.equal(cycleResponse.status, 200); assert.match((await cycleResponse.json()).warning, /순환 링크/);
  const preview = await mapRoute.GET(request(undefined, `http://localhost/api/test?preview=1`), context(projectId, { mapId: first.id }));
  assert.equal(preview.status, 200); assert.equal(preview.headers.get('content-type'), 'image/svg+xml'); assert.match(await preview.text(), /data:image\/webp;base64/);
  const entity = await (await entityRoute.GET(request(undefined, `http://localhost/api/test?kind=world&entityId=${entryId}`), ctx)).json();
  assert.equal(entity.entry.content, '왕국의 전체 설정');
  assert.equal((await worldRoute.DELETE(request(undefined, undefined, 'DELETE'), { params: Promise.resolve({ id: projectId, entryId }) })).status, 200);
  let afterDelete = await (await mapRoute.GET(request(), context(projectId, { mapId: first.id }))).json();
  assert.equal(afterDelete.pins.filter((pin) => pin.kind === 'world').length, 0); assert.equal(afterDelete.pins.length, 2);
  assert.equal((await mapRoute.DELETE(request(undefined, undefined, 'DELETE'), context(projectId, { mapId: second.id }))).status, 200);
  afterDelete = await (await mapRoute.GET(request(), context(projectId, { mapId: first.id }))).json();
  const broken = afterDelete.pins.find((pin) => pin.kind === 'terrain'); assert.equal(broken.targetId, null);
  const replacement = await createMap('새 도시', '#aaccee');
  const recovered = afterDelete.pins.map((pin) => pin.id === broken.id ? { ...pin, targetId: replacement.id } : pin);
  const recoveredResponse = await mapRoute.PUT(request({ revision: 2, pins: recovered }, undefined, 'PUT'), context(projectId, { mapId: first.id }));
  assert.equal(recoveredResponse.status, 200); assert.equal((await recoveredResponse.json()).pins.find((pin) => pin.id === broken.id).targetId, replacement.id);
  const stale = await mapRoute.PUT(request({ revision: 2, pins: [] }, undefined, 'PUT'), context(projectId, { mapId: first.id }));
  assert.equal(stale.status, 409); assert.equal((await mapRoute.GET(request(), context(projectId, { mapId: first.id }))).status, 200);
  const imagePaths = db.prepare('SELECT image_path,image_2x_path,thumbnail_path FROM world_maps').all().flatMap((map) => Object.values(map));
  assert.equal((await projectRoute.DELETE(request(undefined, undefined, 'DELETE'), ctx)).status, 200);
  assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n, 0); assert.equal(db.prepare('SELECT count(*) n FROM map_pins').get().n, 0);
  for (const file of imagePaths) await assert.rejects(access(path.join(process.env.UPLOADS_DIR, file.slice('/uploads/'.length))), { code: 'ENOENT' });
  db.close();
  console.log(JSON.stringify({ ok: true, mapsCreated: 3, optimizedImages: true, duplicatePins: true, inactivePins: true, customPinColor: true, folderToUnclassified: true, cycleWarning: true, previewWithPins: true, entityPinsCascade: true, terrainRecovery: true, staleDraftRejected: true, projectImageCleanup: true }));
}
main().catch((error) => { console.error(error); process.exit(1); });
