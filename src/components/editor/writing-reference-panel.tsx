'use client';

import { BookOpenCheck, Map as MapIcon, Maximize2, Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  EntryDetailDialog,
  type WorldEntry,
} from '@/components/world/world-entry-list';
import { type MapEntity, type MapPin, mapPinName, pinColor, type WorldMap } from '@/lib/maps';
import { splitResearchContent } from '@/lib/web-research/content';

type Catalog = { maps: WorldMap[]; entities: MapEntity[] };
export type WritingReferencePanelProps = {
  onCloseMap: () => void;
  onCloseWorld: () => void;
  projectId: string;
  showMap: boolean;
  showWorld: boolean;
};

export function WritingReferencePanel({
  onCloseMap,
  onCloseWorld,
  projectId,
  showMap,
  showWorld,
}: WritingReferencePanelProps) {
  const [catalog, setCatalog] = useState<Catalog>({ maps: [], entities: [] });
  const [map, setMap] = useState<WorldMap | null>(null);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [query, setQuery] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<WorldEntry | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
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
      setCatalog(result);
      setCategoryOptions([...new Set<string>(result.entities.filter((entry: MapEntity) => entry.kind === 'world').map((entry: MapEntity) => entry.category))]);
      if (result.maps[0]) await loadMap(result.maps[0].id, controller.signal);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    fetch(`/api/projects/${projectId}/world-categories`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const categories = await response.json() as Array<{ name?: string }>;
        setCategoryOptions((current) => [...new Set([...current, ...categories.map((category) => category.name).filter((name): name is string => Boolean(name))])]);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [projectId]);
  const worldEntries = useMemo(
    () => catalog.entities.filter((entry) => entry.kind === 'world' && `${entry.title} ${entry.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
    [catalog.entities, query]
  );
  const openWorldEntry = async (entryId: string) => {
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/maps/entity?kind=world&entityId=${entryId}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '세계관 항목을 불러오지 못했습니다.');
      setSelectedEntry({ ...result.entry, tags: result.tags } as WorldEntry);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '세계관 항목을 불러오지 못했습니다.');
    }
  };
  const openPin = (pin: MapPin) => {
    if (pin.kind !== 'world' || !pin.targetId) return;
    setMapExpanded(false);
    void openWorldEntry(pin.targetId);
  };
  const updateCatalogEntry = (entry: WorldEntry) => {
    setCatalog((current) => ({
      ...current,
      entities: current.entities.map((candidate) => candidate.id === entry.id && candidate.kind === 'world'
        ? { ...candidate, title: entry.title, category: entry.category, summary: splitResearchContent(entry.content).content.slice(0, 220) }
        : candidate),
    }));
    setSelectedEntry(entry);
  };

  return <>
    {showWorld && <aside aria-label="집필 세계관 항목" className="flex min-h-0 flex-col overflow-hidden border-t border-border bg-card/70 lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-border p-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><BookOpenCheck className="size-4" />세계관 항목</h3><Button aria-label="세계관 항목 닫기" onClick={onCloseWorld} size="icon" type="button" variant="ghost"><X /></Button></div>
      {error && <p className="border-b border-border px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <Input aria-label="집필 참고 세계관 검색" onChange={(event) => setQuery(event.target.value)} placeholder="이름·카테고리 검색" value={query} />
        <div className="min-h-24 flex-1 space-y-1 overflow-y-auto pr-1">{worldEntries.map((entry) => <Tooltip key={entry.id}>
          <TooltipTrigger asChild><button className="block w-full rounded-lg border border-border p-2 text-left text-sm hover:border-primary/30 hover:bg-accent focus-visible:border-primary" onClick={() => void openWorldEntry(entry.id)} type="button"><span className="block font-medium">{entry.title}</span><span className="text-xs text-muted-foreground">{entry.category}</span></button></TooltipTrigger>
          <TooltipContent className="max-w-80 whitespace-normal text-pretty leading-5" side="left" sideOffset={8}><strong className="block">{entry.title}</strong><span>{entry.summary || '등록된 요약이 없습니다.'}</span></TooltipContent>
        </Tooltip>)}</div>
      </div>
    </aside>}
    {showMap && <aside aria-label="집필 미니맵" className="flex min-h-0 flex-col overflow-hidden border-t border-border bg-card/70 lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-border p-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><MapIcon className="size-4" />미니맵</h3><Button aria-label="미니맵 닫기" onClick={onCloseMap} size="icon" type="button" variant="ghost"><X /></Button></div>
      {error && !showWorld && <p className="border-b border-border px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex justify-end">{map && <Button aria-label="미니맵 확대" onClick={() => { setMapZoom(1); setMapExpanded(true); }} size="sm" type="button" variant="outline"><Maximize2 />확대</Button>}</div>
        {catalog.maps.length > 0 ? <select aria-label="집필 미니맵 선택" className="w-full rounded-lg border border-input bg-background p-2 text-sm" onChange={(event) => void loadMap(event.target.value).catch((failure) => setError(failure.message))} value={map?.id ?? ''}>{catalog.maps.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select> : <p className="text-sm text-muted-foreground">등록된 지도가 없습니다.</p>}
        {map && <div><MapCanvas catalog={catalog} map={map} onPinClick={openPin} pins={pins} /><p className="mt-2 text-xs text-muted-foreground">{map.name} · 핀 {pins.length}개</p></div>}
      </div>
    </aside>}

    {showMap && map && <Dialog onOpenChange={setMapExpanded} open={mapExpanded}>
      <DialogContent className="flex h-[min(90vh,56rem)] flex-col sm:max-w-6xl">
        <DialogHeader><DialogTitle>{map.name}</DialogTitle><DialogDescription>확대·축소한 뒤 스크롤하여 지도를 확인할 수 있습니다.</DialogDescription></DialogHeader>
        <div className="flex items-center gap-2"><Button aria-label="지도 축소" disabled={mapZoom <= 1} onClick={() => setMapZoom((zoom) => Math.max(1, zoom - 0.5))} size="icon" type="button" variant="outline"><Minus /></Button><Button aria-label="지도 확대" disabled={mapZoom >= 4} onClick={() => setMapZoom((zoom) => Math.min(4, zoom + 0.5))} size="icon" type="button" variant="outline"><Plus /></Button><Button onClick={() => setMapZoom(1)} size="sm" type="button" variant="ghost">화면 맞춤</Button><span className="text-xs tabular-nums text-muted-foreground">{Math.round(mapZoom * 100)}%</span></div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-muted/50 p-2"><MapCanvas catalog={catalog} highResolution map={map} onPinClick={openPin} pins={pins} zoom={mapZoom} /></div>
      </DialogContent>
    </Dialog>}
    {selectedEntry && <EntryDetailDialog categoryOptions={categoryOptions} entry={selectedEntry} onClose={() => setSelectedEntry(null)} onDeleted={(entryId) => { setCatalog((current) => ({ ...current, entities: current.entities.filter((entry) => entry.id !== entryId) })); setPins((current) => current.filter((pin) => !(pin.kind === 'world' && pin.targetId === entryId))); setSelectedEntry(null); }} onEntryChange={updateCatalogEntry} projectId={projectId} />}
  </>;
}

function MapCanvas({ catalog, highResolution = false, map, onPinClick, pins, zoom = 1 }: {
  catalog: Catalog;
  highResolution?: boolean;
  map: WorldMap;
  onPinClick: (pin: MapPin) => void;
  pins: MapPin[];
  zoom?: number;
}) {
  return <div className="relative mx-auto overflow-hidden rounded-xl border border-border bg-muted" style={{ aspectRatio: `${map.width} / ${map.height}`, width: `${zoom * 100}%` }}><img alt={map.name} className="absolute inset-0 size-full object-fill" src={highResolution ? map.image2xPath || map.imagePath : map.imagePath} />{pins.map((pin) => <button aria-label={mapPinName(pin, catalog.entities, catalog.maps)} className="absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 shadow hover:scale-125" key={pin.id} onClick={() => onPinClick(pin)} style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, backgroundColor: pinColor(pin, catalog.entities), opacity: 0.72 }} title={mapPinName(pin, catalog.entities, catalog.maps)} type="button" />)}</div>;
}
