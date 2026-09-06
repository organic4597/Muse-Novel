'use client';

import { Bot, ChevronDown, FolderPlus, Map as MapIcon, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { WebResearchSources } from '@/components/ai/web-research-controls';
import { CharacterForm } from '@/components/character/character-form';
import { MapCanvas } from '@/components/maps/map-canvas';
import { AdaptiveDetailDialogContent } from '@/components/ui/adaptive-detail-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { WorldBuilderAssistant } from '@/components/world/world-builder-assistant';
import { WorldEntryForm } from '@/components/world/world-entry-form';
import { displayEntityValue, ENTITY_FIELDS } from '@/lib/entity-revisions';
import { createMapPinId, createsMapCycle, DEFAULT_PIN_PALETTE, MAP_CUSTOM_PALETTE_LIMIT, MAP_PIN_LIMIT, type MapEntity, type MapFolder, type MapKind, type MapLink, type MapPin, mapPinName, moveMapPins, type Point, pinColor, type WorldMap } from '@/lib/maps';
import { readResearchJson, splitResearchContent } from '@/lib/web-research/content';

type Catalog = { maps: WorldMap[]; folders: MapFolder[]; entities: MapEntity[]; links: MapLink[]; palette?: string[] };
type Placement = { kind: MapKind; targetId: string };
const emptyCatalog: Catalog = { maps: [], folders: [], entities: [], links: [], palette: [] };
export function MapsWorkspace({ projectId }: { projectId: string }) {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [current, setCurrent] = useState<WorldMap | null>(null);
  const [pins, setPins] = useState<MapPin[]>([]); const [saved, setSaved] = useState<MapPin[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [inspection, setInspection] = useState<{ kind: 'world' | 'character'; id: string } | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [query, setQuery] = useState(''); const [visible, setVisible] = useState(60);
  const [draggingMapId, setDraggingMapId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false); const locked = useRef(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [newName, setNewName] = useState(''); const [newFolder, setNewFolder] = useState(''); const [file, setFile] = useState<File | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const paletteInput = useRef<HTMLInputElement>(null);
  const [palettePickerKey, setPalettePickerKey] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const dirty = JSON.stringify(pins) !== JSON.stringify(saved);
  const base = `/api/projects/${projectId}/maps`;
  const api = async (suffix = '', init?: RequestInit) => {
    const response = await fetch(`${base}${suffix}`, init); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? '지도 작업을 완료하지 못했습니다.');
    return data;
  };
  const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const run = async (work: () => Promise<void>) => {
    if (locked.current) return; locked.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : '작업에 실패했습니다.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const acceptMap = (data: { map: WorldMap; pins: MapPin[] }) => {
    setCurrent(data.map); setPins(data.pins); setSaved(data.pins); setSelected([]); setInspection(null); setPlacement(null);
    setCatalog((previous) => ({ ...previous, maps: previous.maps.map((map) => map.id === data.map.id ? data.map : map) }));
  };
  const selectPins = (ids: string[]) => {
    setSelected(ids);
    const pin = ids.length === 1 ? pins.find((item) => item.id === ids[0]) : undefined;
    setInspection(pin && pin.kind !== 'terrain' && pin.targetId ? { kind: pin.kind, id: pin.targetId } : null);
  };
  const canLeave = () => !dirty || window.confirm('저장하지 않은 핀 편집이 있습니다. 변경 사항을 버리고 이동할까요?');
  const loadMap = (id: string) => {
    if (!canLeave()) return;
    void run(async () => {
      const data = await api(`/${id}`);
      acceptMap(data);
      setMessage(`${data.pins.length}개 저장된 핀 위치를 불러왔습니다.`);
    });
  };
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(emptyCatalog); setCurrent(null); setPins([]); setSaved([]);
    fetch(base, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('지도 목록을 불러오지 못했습니다.');
      const data = await response.json() as Catalog; if (controller.signal.aborted) return;
      setCatalog(data);
      if (data.maps[0]) {
        const detail = await fetch(`${base}/${data.maps[0].id}`, { signal: controller.signal });
        if (detail.ok) { const value = await detail.json(); if (!controller.signal.aborted) acceptMap(value); }
      }
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [base]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || event.ctrlKey || event.metaKey || new URL(anchor.href).pathname === location.pathname) return;
      if (!window.confirm('저장하지 않은 지도 핀 편집을 버리고 이동할까요?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const refreshCatalog = async () => {
    const data = await api() as Catalog; setCatalog(data);
    const keep = (pin: MapPin) => pin.kind === 'terrain' || data.entities.some((entity) => entity.id === pin.targetId && entity.kind === pin.kind);
    setPins((previous) => previous.filter(keep)); setSaved((previous) => previous.filter(keep));
    return data;
  };
  const folderAction = (action: 'folder-create' | 'folder-rename' | 'folder-delete', folder?: MapFolder) => {
    if (action === 'folder-delete' && !window.confirm(`“${folder?.name}” 폴더만 삭제할까요? 지도는 모두 미분류로 이동합니다.`)) return;
    const name = action === 'folder-delete' ? undefined : window.prompt(action === 'folder-create' ? '새 지도 폴더 이름' : '지도 폴더 이름 변경', folder?.name ?? '')?.trim();
    if (action !== 'folder-delete' && !name) return;
    void run(async () => { await api('', jsonRequest('POST', { action, folderId: folder?.id, name })); await refreshCatalog(); setMessage('지도 폴더를 반영했습니다.'); });
  };
  const renameMap = (map: WorldMap) => {
    const name = window.prompt('지도 이름 변경', map.name)?.trim(); if (!name || name === map.name) return;
    void run(async () => { const updated = await api(`/${map.id}`, jsonRequest('PATCH', { name }));
      setCurrent((value) => value?.id === map.id ? { ...value, name: updated.name } : value); await refreshCatalog(); });
  };
  const moveMapToFolder = (mapId: string, folderId: string | null) => {
    const map = catalog.maps.find((item) => item.id === mapId);
    setDraggingMapId(null); setDropFolderId(undefined);
    if (!map || map.folderId === folderId) return;
    void run(async () => {
      const updated = await api(`/${mapId}`, jsonRequest('PATCH', { folderId })) as WorldMap;
      setCatalog((previous) => ({ ...previous, maps: previous.maps.map((item) => item.id === mapId ? updated : item) }));
      setCurrent((value) => value?.id === mapId ? { ...value, folderId: updated.folderId } : value);
      setMessage(`“${map.name}” 지도를 ${folderId ? `“${catalog.folders.find((folder) => folder.id === folderId)?.name}”` : '“미분류”'}로 이동했습니다.`);
    });
  };
  const folderDropProps = (folderId: string | null) => ({
    onDragEnter: (event: React.DragEvent) => { if (draggingMapId) { event.preventDefault(); setDropFolderId(folderId); } },
    onDragOver: (event: React.DragEvent) => { if (draggingMapId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } },
    onDragLeave: (event: React.DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropFolderId(undefined); },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      const mapId = event.dataTransfer.getData('application/x-muse-map') || draggingMapId;
      if (mapId) moveMapToFolder(mapId, folderId);
    },
  });
  const deleteMap = (map: WorldMap) => {
    if (!window.confirm(`“${map.name}” 지도와 그 지도에 저장된 핀을 삭제할까요? 다른 지도에서 연결한 지형 핀은 복구 가능한 연결 끊김 상태로 남습니다.${map.id === current?.id && dirty ? ' 저장하지 않은 편집도 버려집니다.' : ''}`)) return;
    void run(async () => {
      await api(`/${map.id}`, { method: 'DELETE' }); await refreshCatalog();
      if (map.id === current?.id) { setCurrent(null); setPins([]); setSaved([]); setSelected([]); setInspection(null); }
      setMessage('지도를 삭제했습니다. 다른 세계관 항목은 삭제하지 않았습니다.');
    });
  };
  const upload = (event: React.FormEvent) => {
    event.preventDefault(); if (!file || !newName.trim() || !canLeave()) return;
    void run(async () => {
      const form = new FormData(); form.set('image', file); form.set('name', newName.trim()); if (newFolder) form.set('folderId', newFolder);
      const data = await api('', { method: 'POST', body: form }); await refreshCatalog(); acceptMap(data);
      setFile(null); setNewName(''); if (uploadInput.current) uploadInput.current.value = ''; setMessage('이미지를 최적화해 지도를 등록했습니다.');
    });
  };
  const replaceImage = (image: File) => {
    if (!current || dirty) { setError('이미지를 교체하기 전에 핀 편집을 저장하거나 되돌려주세요.'); return; }
    void run(async () => {
      const form = new FormData(); form.set('image', image); form.set('revision', String(current.revision));
      let data;
      try { data = await api(`/${current.id}`, { method: 'POST', body: form }); }
      catch (failure) {
        if (!(failure instanceof Error) || !failure.message.startsWith('ASPECT_RATIO_CHANGED') || !window.confirm('새 이미지의 비율이 다릅니다. 좌표는 유지하지만 핀 위치가 달라 보일 수 있습니다. 교체할까요?')) throw failure;
        form.set('allowAspectChange', 'true'); data = await api(`/${current.id}`, { method: 'POST', body: form });
      }
      acceptMap(data); await refreshCatalog(); setMessage('이미지를 교체했습니다. 핀 위치를 확인해주세요.');
    });
  };
  const cycleWarning = (targetId: string) => current && createsMapCycle(current.id, targetId, [
    ...catalog.links.filter((link) => link.mapId !== current.id),
    ...pins.filter((pin) => pin.kind === 'terrain' && pin.targetId).map((pin) => ({ mapId: current.id, targetId: pin.targetId! })),
  ]);
  const place = (value: Placement, point: Point) => {
    if (!current || pins.length >= MAP_PIN_LIMIT) { setError(`한 지도에 최대 ${MAP_PIN_LIMIT}개 핀을 배치할 수 있습니다.`); return; }
    const target = value.kind === 'terrain' ? catalog.maps.find((map) => map.id === value.targetId && map.id !== current.id) : catalog.entities.find((entity) => entity.id === value.targetId && entity.kind === value.kind);
    if (!target) return;
    const pin: MapPin = { id: createMapPinId(), kind: value.kind, targetId: value.targetId, label: 'title' in target ? target.title : target.name, status: 'active', flagColor: null, ...point };
    setPins((previous) => [...previous, pin]); setSelected([pin.id]); setInspection(pin.kind !== 'terrain' ? { kind: pin.kind, id: pin.targetId! } : null); setPlacement(null);
    setMessage(pin.kind === 'terrain' && cycleWarning(pin.targetId!) ? '순환 링크가 감지되었습니다. 허용되는 연결이며 저장 버튼으로 반영할 수 있습니다.' : '핀을 배치했습니다. 저장 버튼을 눌러 반영하세요.');
  };
  const updatePin = (id: string, changes: Partial<MapPin>) => setPins((previous) => previous.map((pin) => pin.id === id ? { ...pin, ...changes } : pin));
  const deleteSelected = () => { if (selected.length && window.confirm(`선택한 핀 ${selected.length}개를 배치에서 제거할까요? 원본 항목은 유지되며 저장 전까지 되돌릴 수 있습니다.`)) {
    setPins((previous) => previous.filter((pin) => !selected.includes(pin.id))); setSelected([]); setInspection(null);
  } };
  const activePin = selected.length === 1 ? pins.find((pin) => pin.id === selected[0]) : undefined;
  const activeFlagColor = activePin ? activePin.flagColor ?? pinColor({ ...activePin, status: 'active' }, catalog.entities) : '#2563eb';
  const customPalette = catalog.palette ?? [];
  const paletteSlots = [
    ...DEFAULT_PIN_PALETTE.map((item) => ({ ...item, custom: false })),
    ...Array.from({ length: MAP_CUSTOM_PALETTE_LIMIT }, (_, index) => customPalette[index]
      ? { name: `사용자 색상 ${index + 1}`, color: customPalette[index], custom: true }
      : null),
  ];
  const addPaletteColor = (color: string) => {
    setPalettePickerKey((key) => key + 1);
    void run(async () => {
      const data = await api('', jsonRequest('POST', { action: 'palette-add', color }));
      setCatalog((previous) => ({ ...previous, palette: data.palette }));
      if (activePin) updatePin(activePin.id, { flagColor: color.toLowerCase() });
      setMessage('사용자 팔레트에 색상을 추가하고 현재 핀에 적용했습니다. 핀 저장 버튼을 눌러 반영하세요.');
    });
  };
  const deletePaletteColor = (color: string) => {
    if (!window.confirm(`${color.toUpperCase()} 색상을 사용자 팔레트에서 삭제할까요? 다른 핀에 저장된 색은 유지됩니다.`)) return;
    void run(async () => {
      const data = await api('', jsonRequest('POST', { action: 'palette-delete', color }));
      setCatalog((previous) => ({ ...previous, palette: data.palette }));
      if (activePin?.flagColor === color) updatePin(activePin.id, { flagColor: null });
      setMessage('사용자 팔레트 색상을 삭제했습니다. 기존 다른 핀의 저장된 색상은 유지됩니다.');
    });
  };
  const updateMappedEntity = (kind: 'world' | 'character', id: string, entry: Record<string, unknown>) => {
    const title = kind === 'world' ? entry.title : entry.name;
    const category = kind === 'world' ? entry.category : entry.role;
    const summary = kind === 'world' ? splitResearchContent(typeof entry.content === 'string' ? entry.content : null).content : entry.backstory;
    setCatalog((previous) => ({ ...previous, entities: previous.entities.map((entity) => entity.id === id && entity.kind === kind ? {
      ...entity,
      title: typeof title === 'string' ? title : entity.title,
      category: typeof category === 'string' && category ? category : kind === 'character' ? '인물' : entity.category,
      summary: typeof summary === 'string' ? summary.slice(0, 220) : '',
      imagePath: kind === 'character' && typeof entry.imagePath === 'string' ? entry.imagePath : entity.imagePath,
    } : entity) }));
  };
  const filtered = catalog.entities.filter((entity) => `${entity.title} ${entity.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const mapRows = (folderId: string | null) => catalog.maps.filter((map) => map.folderId === folderId).map((map) => <div className={`flex cursor-grab items-center gap-1 rounded-lg p-1 active:cursor-grabbing ${draggingMapId === map.id ? 'opacity-45' : ''} ${current?.id === map.id ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-accent'}`}
    data-testid={`map-row-${map.id}`} draggable={!busy} key={map.id}
    onDragEnd={() => { setDraggingMapId(null); setDropFolderId(undefined); }}
    onDragStart={(event) => { event.dataTransfer.setData('application/x-muse-map', map.id); event.dataTransfer.effectAllowed = 'move'; setDraggingMapId(map.id); }} title="지도 폴더로 드래그해서 이동">
    <button aria-current={current?.id === map.id ? 'page' : undefined} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" disabled={busy} onClick={() => loadMap(map.id)} type="button">
      <img alt="" className="h-9 w-11 shrink-0 rounded object-cover" loading="lazy" src={map.thumbnailPath} /><span className="truncate">{map.name}</span>
    </button>
    <button aria-label={`${map.name} 지도 이름 변경`} className="rounded p-1 hover:bg-accent" disabled={busy} onClick={() => renameMap(map)} type="button"><Pencil className="size-3" /></button>
    <button aria-label={`${map.name} 지도 삭제`} className="rounded p-1 hover:bg-destructive/15" disabled={busy} onClick={() => deleteMap(map)} type="button"><Trash2 className="size-3" /></button>
  </div>);
  return <section aria-label="세계관 지도" className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 font-heading text-2xl font-semibold"><MapIcon />세계관 지도</h1><p className="mt-1 text-xs text-muted-foreground">배치·이동·상태 변경은 저장 버튼을 누를 때만 반영됩니다.</p></div>
      <div className="flex items-center gap-2">
        <span className="text-xs" role="status">{busy ? '처리 중...' : dirty ? '저장하지 않은 변경 있음' : '저장된 상태'}</span>
        <Button disabled={!current || !dirty || busy} onClick={() => void run(async () => {
          const data = await api(`/${current!.id}`, jsonRequest('PUT', { revision: current!.revision, pins }));
          acceptMap(data); await refreshCatalog(); setMessage(data.warning ?? '핀 배치를 저장했습니다.');
        })} type="button"><Save />저장</Button>
        <Button disabled={!current || busy} onClick={() => current && loadMap(current.id)} type="button" variant="outline">저장된 핀 위치 불러오기</Button>
        <Button disabled={busy} onClick={() => void run(async () => { await refreshCatalog(); setMessage('항목·지도 목록을 갱신했습니다. 삭제된 항목의 핀은 제거했습니다.'); })} type="button" variant="ghost">자료 새로고침</Button>
      </div>
    </header>
    {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
    {message && <p className="rounded-lg bg-primary/10 p-3 text-sm" role="status">{message}</p>}
    <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
      <aside aria-label="지도 목록" className="muse-panel min-w-0 space-y-4 p-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">지도 목록</h2><Button aria-label="지도 폴더 추가" disabled={busy} onClick={() => folderAction('folder-create')} size="icon" type="button" variant="ghost"><FolderPlus /></Button></div>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          <div className={`rounded-lg p-1 transition-colors ${dropFolderId === null ? 'bg-primary/15 ring-2 ring-primary/50' : ''}`} data-testid="map-folder-unclassified" {...folderDropProps(null)}>
            <details open><summary className="cursor-pointer py-1 text-sm">미분류</summary><div className="min-h-8 space-y-1">{mapRows(null)}</div></details>
          </div>
          {catalog.folders.map((folder) => <div className={`rounded-lg p-1 transition-colors ${dropFolderId === folder.id ? 'bg-primary/15 ring-2 ring-primary/50' : ''}`} data-testid={`map-folder-${folder.id}`} key={folder.id} {...folderDropProps(folder.id)}>
            <details open>
              <summary className="cursor-pointer py-1 text-sm">{folder.name}</summary>
              <div className="mb-1 flex gap-2"><button className="text-xs text-muted-foreground" disabled={busy} onClick={() => folderAction('folder-rename', folder)} type="button">이름 변경</button><button className="text-xs text-muted-foreground" disabled={busy} onClick={() => folderAction('folder-delete', folder)} type="button">폴더 삭제</button></div>
              <div className="min-h-8 space-y-1">{mapRows(folder.id)}</div>
            </details>
          </div>)}
        </div>
        <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-medium">＋ 새 지도 업로드</summary>
          <form className="mt-3 space-y-2" onSubmit={upload}>
            <Input aria-label="새 지도 이름" disabled={busy} maxLength={80} onChange={(event) => setNewName(event.target.value)} placeholder="지도 이름" required value={newName} />
            <select aria-label="새 지도 폴더" className="w-full rounded border border-input bg-popover p-2 text-sm text-popover-foreground" disabled={busy} onChange={(event) => setNewFolder(event.target.value)} value={newFolder}>
              <option value="">미분류</option>{catalog.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            <input accept="image/png,image/jpeg,image/webp" aria-label="새 지도 이미지" className="w-full text-xs" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} ref={uploadInput} required type="file" />
            <p className="text-[11px] text-muted-foreground">PNG/JPG/WebP · 최대 12MB · 3,200만 화소</p>
            <Button disabled={busy || !file || !newName.trim()} size="sm" type="submit"><Upload />지도 등록</Button>
          </form>
        </details>
        {current && <div className="space-y-2 border-t border-border pt-3">
          <h2 className="text-sm font-semibold">배치할 항목</h2>
          <Input aria-label="지도에 배치할 항목 검색" onChange={(event) => { setQuery(event.target.value); setVisible(60); }} placeholder="이름·종류 검색" value={query} />
          <div className="max-h-64 space-y-1 overflow-y-auto">{filtered.slice(0, visible).map((entity) => <button className={`block w-full rounded-lg border p-2 text-left text-xs ${placement?.kind === entity.kind && placement.targetId === entity.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}`}
            disabled={busy} draggable={!busy} key={`${entity.kind}:${entity.id}`} onClick={() => setPlacement({ kind: entity.kind, targetId: entity.id })}
            onDragStart={(event) => { event.dataTransfer.setData('application/x-muse-map-item', JSON.stringify({ kind: entity.kind, targetId: entity.id })); event.dataTransfer.effectAllowed = 'copy'; }} type="button">
              <span className="block font-medium">{entity.title}</span><span className="text-muted-foreground">{entity.kind === 'character' ? '인물' : entity.category}</span>
            </button>)}</div>
          {filtered.length > visible && <Button onClick={() => setVisible((count) => count + 60)} size="sm" type="button" variant="ghost">항목 더 보기</Button>}
          <label className="block space-y-1 text-xs"><span>지형 핀으로 연결할 지도</span>
            <select className="w-full rounded border border-input bg-popover p-2 text-popover-foreground" disabled={busy} onChange={(event) => {
              setPlacement(event.target.value ? { kind: 'terrain', targetId: event.target.value } : null);
              setMessage(event.target.value && cycleWarning(event.target.value) ? '순환 링크가 감지되었습니다. 연결은 허용됩니다.' : '');
            }} value={placement?.kind === 'terrain' ? placement.targetId : ''}>
              <option value="">지도 선택</option>{catalog.maps.filter((map) => map.id !== current.id).map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
            </select>
          </label>
          {placement && <p className="text-xs text-primary">지도 위 원하는 곳을 클릭하세요. <button className="underline" onClick={() => setPlacement(null)} type="button">배치 취소</button></p>}
        </div>}
      </aside>
      <div className="min-w-0 space-y-3">
        {current ? <>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{current.name} <span className="text-xs font-normal text-muted-foreground">핀 {pins.length}/{MAP_PIN_LIMIT}</span></h2>
            <div className="flex flex-wrap gap-2">
              <select aria-label="현재 지도 폴더 이동" className="rounded border border-input bg-popover px-2 py-1 text-xs text-popover-foreground" disabled={busy} onChange={(event) => void run(async () => {
                const map = await api(`/${current.id}`, jsonRequest('PATCH', { folderId: event.target.value || null })); setCurrent((value) => value ? { ...value, folderId: map.folderId } : value); await refreshCatalog();
              })} value={catalog.maps.find((map) => map.id === current.id)?.folderId ?? ''}><option value="">미분류</option>{catalog.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
              <label className={`rounded border border-input px-2 py-1 text-xs ${busy || dirty ? 'opacity-50' : 'cursor-pointer hover:bg-accent'}`}>이미지 교체<input accept="image/png,image/jpeg,image/webp" aria-label="지도 이미지 교체" className="sr-only" disabled={busy || dirty} onChange={(event) => { const image = event.target.files?.[0]; if (image) replaceImage(image); event.target.value = ''; }} type="file" /></label>
            </div>
          </div>
          <MapCanvas disabled={busy} entities={catalog.entities} key={`${current.id}:${current.imagePath}`} map={current} maps={catalog.maps} onChange={setPins} onNavigate={loadMap} onPlace={place} onSelect={selectPins} pins={pins} placement={placement} selected={selected} />
        </> : <div className="muse-panel grid min-h-96 place-items-center p-8 text-center"><div><MapIcon className="mx-auto mb-4 size-10 text-muted-foreground" /><p>왼쪽에서 지도를 선택하거나 새 이미지를 업로드하세요.</p></div></div>}
      </div>
      <aside aria-label="지도 핀 상세 정보" className="muse-panel min-w-0 space-y-4 p-4 lg:col-start-2 xl:col-start-auto">
        <h2 className="font-semibold">핀 상세</h2>
        {!selected.length && !inspection && <p className="text-sm text-muted-foreground">핀을 클릭하면 원본 항목의 정보가 여기에 표시됩니다.</p>}
        {selected.length > 1 && <div className="space-y-3"><p className="font-medium">{selected.length}개 핀 선택</p><p className="text-xs text-muted-foreground">선택된 핀을 드래그하면 상대 위치를 유지하며 함께 이동합니다.</p>
          <div className="flex gap-1">{[['←', -0.01, 0], ['→', 0.01, 0], ['↑', 0, -0.01], ['↓', 0, 0.01]].map(([label, x, y]) => <Button aria-label={`선택 핀 ${label} 이동`} disabled={busy} key={String(label)} onClick={() => setPins(moveMapPins(pins, selected, { x: Number(x), y: Number(y) }))} size="sm" type="button" variant="outline">{label}</Button>)}</div>
        </div>}
        {activePin && <div className="space-y-3">
          <p className="break-words font-medium">{mapPinName(activePin, catalog.entities, catalog.maps)}</p>
          <label className="flex items-center gap-2 text-sm"><input checked={activePin.status === 'active'} disabled={busy} onChange={(event) => updatePin(activePin.id, { status: event.target.checked ? 'active' : 'inactive' })} type="checkbox" />핀 활성 상태</label>
          <div className="space-y-2 rounded-lg border border-border p-2">
            <div className="flex items-center justify-between gap-2"><span className="text-sm">핀 머리 색상</span><span className="font-mono text-xs text-muted-foreground">{activeFlagColor.toUpperCase()}</span></div>
            <div aria-label="핀 색상 팔레트" className="grid w-fit grid-cols-6 gap-1.5">
              {paletteSlots.map((slot, index) => slot
                ? <button aria-label={`${slot.custom ? slot.name : `기본 팔레트 ${slot.name}`} 핀 색상 선택`} className={`grid size-8 place-items-center rounded-full border-2 transition-transform hover:scale-110 ${activePin.flagColor === slot.color ? 'border-foreground ring-2 ring-ring/50' : 'border-white/80'}`}
                  disabled={busy} key={`${slot.color}:${index}`} onClick={() => updatePin(activePin.id, { flagColor: slot.color })} style={{ backgroundColor: slot.color }} title={`${slot.name} ${slot.color.toUpperCase()}`} type="button"><span className="sr-only">{slot.color}</span></button>
                : <button aria-label={`사용자 팔레트 ${index - DEFAULT_PIN_PALETTE.length + 1} 추가`} className="grid size-8 place-items-center rounded-full border border-dashed border-muted-foreground/60 text-muted-foreground hover:border-primary hover:text-primary"
                  disabled={busy} key={`empty:${index}`} onClick={() => paletteInput.current?.click()} type="button"><Plus className="size-4" /></button>)}
            </div>
            <input aria-label="새 사용자 팔레트 색상" className="sr-only" disabled={busy} key={palettePickerKey} onChange={(event) => addPaletteColor(event.target.value)} ref={paletteInput} type="color" />
            <Button disabled={busy || !activePin.flagColor} onClick={() => updatePin(activePin.id, { flagColor: null })} size="sm" type="button" variant="outline">자동 색상으로 되돌리기</Button>
            {activePin.flagColor && customPalette.includes(activePin.flagColor) && <Button disabled={busy} onClick={() => deletePaletteColor(activePin.flagColor!)} size="sm" type="button" variant="ghost">선택한 사용자 색상 삭제</Button>}
          </div>
          <p className="text-xs text-muted-foreground">{activePin.status === 'inactive' ? '비활성 핀은 회색으로 표시됩니다.' : '활성 핀'} · ({activePin.x.toFixed(3)}, {activePin.y.toFixed(3)})</p>
          {activePin.kind === 'terrain' && <label className="block space-y-2 text-sm"><span>{catalog.maps.some((map) => map.id === activePin.targetId) ? '연결 지도 변경' : '복구 — 새 지도 선택'}</span>
            <select aria-label="지형 핀 연결 지도" className="w-full rounded border border-input bg-popover p-2 text-popover-foreground" disabled={busy} onChange={(event) => {
              const target = catalog.maps.find((map) => map.id === event.target.value); if (!target) return;
              updatePin(activePin.id, { targetId: target.id, label: target.name });
              setMessage(cycleWarning(target.id) ? '순환 링크가 감지되었습니다. 연결은 허용되며 저장 시 반영됩니다.' : '지형 핀 연결을 변경했습니다. 저장 버튼으로 반영하세요.');
            }} value={catalog.maps.some((map) => map.id === activePin.targetId) ? activePin.targetId ?? '' : ''}>
              <option disabled value="">복구할 지도 선택</option>{catalog.maps.filter((map) => map.id !== current?.id).map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
            </select>
            {activePin.targetId && catalog.maps.some((map) => map.id === activePin.targetId) && <Button onClick={() => loadMap(activePin.targetId!)} size="sm" type="button" variant="outline">연결 지도 열기</Button>}
          </label>}
        </div>}
        {selected.length > 0 && <Button disabled={busy} onClick={deleteSelected} size="sm" type="button" variant="destructive"><Trash2 />선택 핀 삭제</Button>}
        {inspection && selected.length < 2 && <MapEntityDetails entity={inspection} onChanged={(entry) => updateMappedEntity(inspection.kind, inspection.id, entry)} onInspect={(entity) => { setSelected([]); setInspection(entity); }} projectId={projectId} />}
      </aside>
    </div>
    <div className="fixed right-5 bottom-5 z-40" data-testid="world-assistant-remote">
      <Popover onOpenChange={setAssistantOpen} open={assistantOpen}>
        <PopoverTrigger asChild>
          <Button aria-label="World assistant 열기" className="h-11 rounded-full border border-primary/30 bg-card/95 px-4 text-card-foreground shadow-xl backdrop-blur transition-transform hover:scale-[1.03] hover:bg-accent" type="button" variant="outline">
            <Bot className="size-4 text-primary" />
            <span className="hidden sm:inline">World assistant</span>
            <ChevronDown className={`size-4 transition-transform ${assistantOpen ? 'rotate-180' : ''}`} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="max-h-[min(78dvh,52rem)] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto p-2 data-[state=closed]:hidden sm:p-3" forceMount side="top" sideOffset={10}>
          <div className="mb-2 flex items-center justify-between gap-3 border-b border-border px-1 pb-2">
            <div><p className="text-sm font-semibold">World assistant</p><p className="text-xs text-muted-foreground">세계관 항목 자동 구축</p></div>
            <Button aria-label="World assistant 닫기" onClick={() => setAssistantOpen(false)} size="icon" type="button" variant="ghost"><X /></Button>
          </div>
          <WorldBuilderAssistant onEntriesAdded={(entries) => {
            const incoming = entries.map((entry): MapEntity => ({
              id: entry.id, kind: 'world', title: entry.title, category: entry.category,
              summary: splitResearchContent(entry.content).content.slice(0, 220), imagePath: null,
            }));
            const ids = new Set(incoming.map((entry) => entry.id));
            setCatalog((previous) => ({ ...previous, entities: [...incoming, ...previous.entities.filter((entry) => !ids.has(entry.id))] }));
            setMessage(`${incoming.length}개 세계관 항목을 승인했습니다. 배치할 항목 목록에 추가했습니다.`);
          }} projectId={projectId} />
        </PopoverContent>
      </Popover>
    </div>
  </section>;
}

type EditableCharacter = NonNullable<ComponentProps<typeof CharacterForm>['character']>;
type EditableWorldEntry = NonNullable<ComponentProps<typeof WorldEntryForm>['entry']>;
function MapEntityDetails({ projectId, entity, onInspect, onChanged }: {
  projectId: string; entity: { kind: 'world' | 'character'; id: string };
  onInspect: (entity: { kind: 'world' | 'character'; id: string }) => void;
  onChanged: (entry: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState<{ entry: Record<string, string | null>; tags: { id: string; tag: string }[]; related: { otherCharacterId: string; otherCharacterName: string; relationshipType: string; description?: string }[] } | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    fetch(`/api/projects/${projectId}/maps/entity?kind=${entity.kind}&entityId=${entity.id}`, { signal: controller.signal }).then(async (response) => {
      const value = await response.json(); if (!response.ok) throw new Error(value.error ?? '항목을 읽지 못했습니다.'); setData(value);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [projectId, entity.kind, entity.id]);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">상세 정보 불러오는 중...</p>;
  const research = readResearchJson(data.entry.researchJson) ?? splitResearchContent(data.entry.content).research;
  const saved = (entry: Record<string, unknown>) => {
    const { tags, ...record } = entry;
    setData((current) => current ? {
      ...current,
      entry: record as Record<string, string | null>,
      tags: Array.isArray(tags) ? tags as { id: string; tag: string }[] : current.tags,
    } : current);
    onChanged(record); setEditing(false);
  };
  return <div className="space-y-4 border-t border-border pt-3">
    <Button onClick={() => setEditing(true)} size="sm" type="button" variant="outline"><Pencil />원본 항목 수정</Button>
    {data.entry.imagePath && <img alt={data.entry.name ?? '대표 이미지'} className="max-h-64 w-full rounded-lg object-contain" src={data.entry.imagePath} />}
    {Object.entries(ENTITY_FIELDS[entity.kind]).filter(([key]) => key !== 'researchJson' && data.entry[key]).map(([key, label]) => <div key={key}>
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{key === 'content' ? splitResearchContent(data.entry[key]).content : displayEntityValue(key, data.entry[key])}</p>
    </div>)}
    <WebResearchSources research={research} />
    <div className="flex flex-wrap gap-1">{data.tags.map((tag) => <span className="rounded bg-secondary px-2 py-1 text-xs" key={tag.id}>#{tag.tag}</span>)}</div>
    {data.related.length > 0 && <div className="space-y-1"><h3 className="text-xs text-muted-foreground">관련 항목</h3>{data.related.map((related, index) => <button className="block w-full rounded border border-border p-2 text-left text-xs hover:bg-accent" key={`${related.otherCharacterId}:${index}`} onClick={() => onInspect({ kind: entity.kind, id: related.otherCharacterId })} type="button">{related.otherCharacterName} · {related.relationshipType}{related.description && <span className="mt-1 block text-muted-foreground">{related.description}</span>}</button>)}</div>}
    <Dialog onOpenChange={setEditing} open={editing}>
      <AdaptiveDetailDialogContent editing sizingContent={Object.values(data.entry).filter((value): value is string => typeof value === 'string')}>
        <DialogHeader><DialogTitle>{entity.kind === 'world' ? '세계관 항목 수정' : '캐릭터 수정'}</DialogTitle>
          <DialogDescription>이 핀이 연결된 원본 항목을 수정합니다. 같은 항목을 사용하는 다른 핀에도 표시가 반영됩니다.</DialogDescription>
        </DialogHeader>
        {entity.kind === 'world'
          ? <WorldEntryForm entry={{ ...data.entry, tags: data.tags } as EditableWorldEntry} onSuccess={(entry) => saved(entry)} projectId={projectId} />
          : <CharacterForm character={data.entry as EditableCharacter} onSuccess={(entry) => saved(entry)} projectId={projectId} />}
      </AdaptiveDetailDialogContent>
    </Dialog>
  </div>;
}
