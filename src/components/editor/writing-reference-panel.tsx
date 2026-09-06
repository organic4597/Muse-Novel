'use client';

import { BookOpenCheck, Map as MapIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type MapEntity, type MapPin, mapPinName, pinColor, type WorldMap } from '@/lib/maps';

type Catalog = { maps: WorldMap[]; entities: MapEntity[] };
export type WritingReferencePanelProps = { projectId: string; onClose: () => void };

export function WritingReferencePanel({ projectId, onClose }: WritingReferencePanelProps) {
  const [tab, setTab] = useState<'world' | 'map'>('world');
  const [catalog, setCatalog] = useState<Catalog>({ maps: [], entities: [] });
  const [map, setMap] = useState<WorldMap | null>(null);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<MapEntity | null>(null);
  const [error, setError] = useState('');
  const loadMap = async (mapId: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/projects/${projectId}/maps/${mapId}`, { signal });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? '지도를 불러오지 못했습니다.');
    setMap(result.map); setPins(result.pins);
  };
  useEffect(() => {
    const controller = new AbortController(); setError('');
    fetch(`/api/projects/${projectId}/maps`, { signal: controller.signal }).then(async (response) => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? '참고 자료를 불러오지 못했습니다.');
      setCatalog(result); const firstWorld = result.entities.find((entry: MapEntity) => entry.kind === 'world'); setPreview(firstWorld ?? null);
      if (result.maps[0]) await loadMap(result.maps[0].id, controller.signal);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [projectId]);
  const worldEntries = catalog.entities.filter((entry) => entry.kind === 'world' && `${entry.title} ${entry.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <aside aria-label="집필 참고 자료" className="min-h-0 border-t border-border bg-card/70 lg:border-l lg:border-t-0">
    <div className="flex items-center justify-between border-b border-border p-2"><div className="flex gap-1"><Button aria-pressed={tab === 'world'} onClick={() => setTab('world')} size="sm" type="button" variant={tab === 'world' ? 'secondary' : 'ghost'}><BookOpenCheck />세계관</Button><Button aria-pressed={tab === 'map'} onClick={() => setTab('map')} size="sm" type="button" variant={tab === 'map' ? 'secondary' : 'ghost'}><MapIcon />미니맵</Button></div><Button aria-label="참고 자료 닫기" onClick={onClose} size="icon" type="button" variant="ghost"><X /></Button></div>
    <div className="max-h-[32rem] space-y-3 overflow-y-auto p-3 lg:max-h-[calc(100vh-18rem)]">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {tab === 'world' && <><Input aria-label="집필 참고 세계관 검색" onChange={(event) => setQuery(event.target.value)} placeholder="이름·카테고리 검색" value={query} />
        {preview && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">{preview.imagePath && <img alt="" className="mb-2 max-h-32 w-full rounded-lg object-contain" src={preview.imagePath} />}<p className="font-semibold">{preview.title}</p><p className="text-xs text-muted-foreground">{preview.category}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{preview.summary || '등록된 요약이 없습니다.'}</p></div>}
        <div className="space-y-1">{worldEntries.map((entry) => <button className="block w-full rounded-lg border border-border p-2 text-left text-sm hover:border-primary/30 hover:bg-accent focus-visible:border-primary" key={entry.id} onClick={() => setPreview(entry)} onFocus={() => setPreview(entry)} onMouseEnter={() => setPreview(entry)} type="button"><span className="block font-medium">{entry.title}</span><span className="text-xs text-muted-foreground">{entry.category}</span></button>)}</div>
      </>}
      {tab === 'map' && <>{catalog.maps.length > 0 ? <select aria-label="집필 미니맵 선택" className="w-full rounded-lg border border-input bg-background p-2 text-sm" onChange={(event) => void loadMap(event.target.value).catch((failure) => setError(failure.message))} value={map?.id ?? ''}>{catalog.maps.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select> : <p className="text-sm text-muted-foreground">등록된 지도가 없습니다.</p>}
        {map && <div><div className="relative mx-auto w-full overflow-hidden rounded-xl border border-border bg-muted" style={{ aspectRatio: `${map.width} / ${map.height}` }}><img alt={map.name} className="absolute inset-0 size-full object-fill" src={map.imagePath} />{pins.map((pin) => <button aria-label={mapPinName(pin, catalog.entities, catalog.maps)} className="absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 shadow" key={pin.id} onClick={() => { const entity = catalog.entities.find((entry) => entry.id === pin.targetId && entry.kind === pin.kind); if (entity) setPreview(entity); }} style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, backgroundColor: pinColor(pin, catalog.entities), opacity: 0.72 }} title={mapPinName(pin, catalog.entities, catalog.maps)} type="button" />)}</div><p className="mt-2 text-xs text-muted-foreground">{map.name} · 핀 {pins.length}개</p></div>}
        {preview && <div className="rounded-xl border border-border p-3"><p className="font-semibold">{preview.title}</p><p className="text-xs text-muted-foreground">{preview.category}</p><p className="mt-1 line-clamp-4 text-sm">{preview.summary}</p></div>}
      </>}
    </div>
  </aside>;
}
