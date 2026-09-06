'use client';

import { HoverCard } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { clamp, clusterMapPins, fitMap,
  type MapEntity, type MapKind, type MapPin, type MapView, mapPinName, mapPoint, moveMapPins, type Point, pinColor, pinsInBox, screenPoint, type WorldMap, zoomMap } from '@/lib/maps';

type Placement = { kind: MapKind; targetId: string };
type Operation = { kind: 'pan' | 'box' | 'pins'; start: Point; view: MapView; pins: MapPin[]; selected: string[]; pointerId: number };
export function MapCanvas({ map, pins, entities, maps, selected, onSelect, onChange, onPlace, onNavigate, onPinOpen, placement, disabled = false, navigationOnly = false }: {
  map: WorldMap; pins: MapPin[]; entities: MapEntity[]; maps: WorldMap[]; selected: string[]; onSelect: (ids: string[]) => void;
  onChange: (pins: MapPin[]) => void; onPlace: (placement: Placement, point: Point) => void; onNavigate: (id: string) => void;
  onPinOpen?: (pin: MapPin) => void; placement: Placement | null; disabled?: boolean; navigationOnly?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 800, height: 560 });
  const [view, setView] = useState<MapView>(() => fitMap(800, 560, map));
  const viewRef = useRef(view);
  const operation = useRef<Operation | null>(null);
  const frame = useRef(0); const pending = useRef<Point | null>(null);
  const [interacting, setInteracting] = useState(false);
  const [box, setBox] = useState<{ start: Point; end: Point } | null>(null);
  const updateView = (value: MapView) => { viewRef.current = value; setView(value); };
  const fit = fitMap(bounds.width, bounds.height, map);
  const point = (clientX: number, clientY: number) => {
    const rect = root.current!.getBoundingClientRect(); return { x: clientX - rect.left, y: clientY - rect.top };
  };
  useEffect(() => {
    const node = root.current; if (!node) return;
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) { setBounds({ width, height }); updateView(fitMap(width, height, map)); }
    });
    resize.observe(node);
    return () => { resize.disconnect(); cancelAnimationFrame(frame.current); };
  }, [map.id, map.width, map.height]);
  useEffect(() => {
    const node = root.current; if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (operation.current) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      updateView(zoomMap(viewRef.current, point(event.clientX, event.clientY), clamp(viewRef.current.scale * Math.exp(-delta * 0.0015), fit.scale, fit.scale * 16)));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [bounds.height, fit.scale]);

  const performMove = (current: Point) => {
    const op = operation.current; if (!op) return;
    if (op.kind === 'pan') updateView({ ...op.view, x: op.view.x + current.x - op.start.x, y: op.view.y + current.y - op.start.y });
    else if (op.kind === 'box') {
      setBox({ start: op.start, end: current });
      onSelect(pinsInBox(op.pins, mapPoint(op.start, op.view, map), mapPoint(current, op.view, map)));
    } else if (Math.hypot(current.x - op.start.x, current.y - op.start.y) > 3) {
      onChange(moveMapPins(op.pins, op.selected, { x: (current.x - op.start.x) / (map.width * op.view.scale), y: (current.y - op.start.y) / (map.height * op.view.scale) }));
    }
  };
  const begin = (event: React.PointerEvent, kind: Operation['kind'], ids = selected) => {
    event.preventDefault();
    operation.current = { kind, start: point(event.clientX, event.clientY), view: viewRef.current, pins, selected: ids, pointerId: event.pointerId };
    root.current?.setPointerCapture(event.pointerId); setInteracting(true);
  };
  const finish = (event: React.PointerEvent) => {
    if (!operation.current || operation.current.pointerId !== event.pointerId) return;
    cancelAnimationFrame(frame.current); frame.current = 0;
    if (pending.current) performMove(pending.current);
    pending.current = null; operation.current = null; setBox(null); setInteracting(false);
    if (root.current?.hasPointerCapture(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
  };
  const focusPin = (pin: MapPin) => {
    const scale = Math.max(viewRef.current.scale, fit.scale * 3);
    updateView({ scale, x: bounds.width / 2 - pin.x * map.width * scale, y: bounds.height / 2 - pin.y * map.height * scale });
    onSelect([pin.id]);
  };
  const placeAt = (value: Placement, position: Point) => {
    const normalized = mapPoint(position, viewRef.current, map);
    if (normalized.x >= 0 && normalized.x <= 1 && normalized.y >= 0 && normalized.y <= 1) onPlace(value, normalized);
  };
  const clusters = clusterMapPins(pins, view, map, selected);
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Button onClick={() => updateView(fit)} size="sm" type="button" variant="outline">화면 맞춤</Button>
        <Button aria-label="지도 확대" onClick={() => updateView(zoomMap(viewRef.current, { x: bounds.width / 2, y: bounds.height / 2 }, clamp(view.scale * 1.4, fit.scale, fit.scale * 16)))} size="sm" type="button" variant="outline">＋</Button>
        <Button aria-label="지도 축소" disabled={view.scale <= fit.scale} onClick={() => updateView(zoomMap(viewRef.current, { x: bounds.width / 2, y: bounds.height / 2 }, clamp(view.scale / 1.4, fit.scale, fit.scale * 16)))} size="sm" type="button" variant="outline">−</Button>
        {!navigationOnly && <Button disabled={!pins.length} onClick={() => onSelect(pins.map((pin) => pin.id))} size="sm" type="button" variant="outline">전체 핀 선택</Button>}
        {!navigationOnly && placement && <Button disabled={disabled} onClick={() => placeAt(placement, { x: bounds.width / 2, y: bounds.height / 2 })} size="sm" type="button" variant="outline">화면 중앙에 배치</Button>}
        <span className="text-muted-foreground">{Math.round(view.scale / fit.scale * 100)}% · 휠 확대/축소 · {navigationOnly ? '드래그 이동' : '우클릭 드래그 이동'}</span>
      </div>
      <div aria-describedby={`map-help-${map.id}`} aria-label="지도 편집 영역" className="relative h-[min(70dvh,800px)] min-h-96 w-full touch-none select-none overflow-hidden rounded-xl border border-border bg-muted/60" data-testid="map-viewport"
        onContextMenu={(event) => event.preventDefault()} onDoubleClick={(event) => { if (event.target === root.current || (event.target as HTMLElement).tagName === 'IMG') updateView(zoomMap(viewRef.current, point(event.clientX, event.clientY), clamp(view.scale * 1.8, fit.scale, fit.scale * 16))); }}
        onDragOver={(event) => { if (!disabled) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={(event) => {
          event.preventDefault(); if (disabled) return;
          try {
            const value = JSON.parse(event.dataTransfer.getData('application/x-muse-map-item')) as Placement;
            if (['world', 'character', 'terrain'].includes(value.kind) && typeof value.targetId === 'string') placeAt(value, point(event.clientX, event.clientY));
          } catch { /* Ignore unrelated browser drops. */ }
        }}
        onPointerCancel={finish}
        onPointerDown={(event) => {
          if (navigationOnly && (event.button === 0 || event.button === 2)) { begin(event, 'pan'); return; }
          if (event.button === 2) { begin(event, 'pan'); return; }
          if (event.button !== 0 || disabled) return;
          if (placement) { placeAt(placement, point(event.clientX, event.clientY)); return; }
          if (event.pointerType === 'touch') { begin(event, 'pan'); return; }
          onSelect([]); begin(event, 'box');
        }}
        onPointerMove={(event) => {
          if (!operation.current || event.pointerId !== operation.current.pointerId) return;
          pending.current = point(event.clientX, event.clientY);
          if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (pending.current) performMove(pending.current); });
        }} onPointerUp={finish} ref={root}>
        {/* Optimized 2x image is bounded at 4096px; no tiles or server rendering on pointer movement. */}
        <img alt={map.name} className="absolute left-0 top-0 max-w-none origin-top-left" draggable={false} height={map.height} src={map.image2xPath}
          style={{ width: map.width, height: map.height, transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`, pointerEvents: 'none' }} width={map.width} />
        {clusters.map((cluster) => {
          const position = screenPoint(cluster, view, map);
          if (position.x < -140 || position.y < -80 || position.x > bounds.width + 140 || position.y > bounds.height + 80) return null;
          const pin = cluster.pins[0];
          return <MapMarker disabled={disabled || interacting} entities={entities} key={cluster.pins.map((item) => item.id).join(':')} map={map} maps={maps}
            members={cluster.pins} onChoose={focusPin} onCluster={() => updateView(zoomMap(viewRef.current, position, clamp(view.scale * 2, fit.scale, fit.scale * 16)))} onDrag={(event) => {
              if (navigationOnly) { event.stopPropagation(); return; }
              if (event.button !== 0 || disabled) return;
              event.stopPropagation();
              const ids = event.shiftKey ? selected.includes(pin.id) ? selected.filter((id) => id !== pin.id) : [...selected, pin.id] : selected.includes(pin.id) ? selected : [pin.id];
              onSelect(ids); if (ids.includes(pin.id)) begin(event, 'pins', ids);
            }} onNavigate={onNavigate} onOpen={navigationOnly ? onPinOpen : undefined}
            position={position}
            selected={selected.includes(pin.id)} />;
        })}
        {box && <div className="pointer-events-none absolute border-2 border-primary bg-primary/15" style={{ left: Math.min(box.start.x, box.end.x), top: Math.min(box.start.y, box.end.y), width: Math.abs(box.end.x - box.start.x), height: Math.abs(box.end.y - box.start.y) }} />}
        {!pins.length && <p className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-popover/95 px-3 py-2 text-xs text-popover-foreground">항목을 끌어 놓거나 목록에서 선택한 뒤 지도를 클릭하세요.</p>}
      </div>
      <p className="text-xs text-muted-foreground" id={`map-help-${map.id}`}>{navigationOnly ? '좌클릭 또는 우클릭 드래그: 지도 이동 · 핀 클릭: 상세 보기' : '좌클릭 드래그: 영역 선택 · 선택된 핀 드래그: 일괄 이동 · Shift+클릭: 선택 추가'}</p>
    </div>
  );
}

function MapMarker({ members, position, selected, disabled, entities, maps, map, onChoose, onNavigate, onOpen, onDrag, onCluster }: {
  members: MapPin[]; position: Point; selected: boolean; disabled: boolean; entities: MapEntity[]; maps: WorldMap[]; map: WorldMap;
  onChoose: (pin: MapPin) => void; onNavigate: (id: string) => void; onOpen?: (pin: MapPin) => void; onDrag: (event: React.PointerEvent) => void; onCluster: () => void;
}) {
  const [hover, setHover] = useState(false);
  const pin = members[0]; const cluster = members.length > 1;
  const target = maps.find((item) => item.id === pin.targetId);
  const entity = entities.find((item) => item.id === pin.targetId && item.kind === pin.kind);
  return <HoverCard.Root closeDelay={0} onOpenChange={setHover} open={hover && !disabled} openDelay={200}>
    <HoverCard.Trigger asChild>
      <button aria-label={cluster ? `핀 ${members.length}개 묶음` : `${mapPinName(pin, entities, maps)} ${pin.status === 'inactive' ? '비활성' : ''}`}
        aria-pressed={!cluster && selected} className="absolute z-10 outline-none focus-visible:drop-shadow-[0_0_4px_var(--primary)]"
        data-pin-id={cluster ? undefined : pin.id} data-testid={cluster ? 'map-cluster' : 'map-pin'}
        onClick={(event) => { if (cluster) { event.stopPropagation(); onCluster(); } else if (onOpen) onOpen(pin); else if (event.detail === 0) onChoose(pin); }}
        onPointerDown={cluster ? (event) => { if (event.button === 0) event.stopPropagation(); } : onDrag}
        style={{ left: position.x, top: position.y, transform: 'translate(-50%,-100%)' }} type="button">
        {cluster ? <span className="grid size-9 place-items-center rounded-full border border-white/90 bg-primary font-bold text-primary-foreground opacity-60 shadow-md" style={members.every((pin) => pin.status === 'inactive') ? { backgroundColor: '#737373', color: '#fff' } : undefined}>{members.length}</span>
          : <svg aria-hidden="true" className={selected ? 'drop-shadow-[0_0_4px_var(--primary)]' : 'drop-shadow-sm'} height="42" viewBox="0 0 22 42" width="22">
            <g opacity="0.6">
              <path d="M11 41V17" stroke="#111827" strokeLinecap="round" strokeWidth="1.4" />
              {pin.kind === 'terrain'
                ? <path d="M11 1 20 10 11 19 2 10Z" fill={pinColor(pin, entities)} stroke={selected ? 'var(--primary)' : '#111827'} strokeWidth="1.4" />
                : <circle cx="11" cy="10" fill={pinColor(pin, entities)} r="8" stroke={selected ? 'var(--primary)' : '#111827'} strokeWidth="1.4" />}
              <text fill="white" fontSize="9" fontWeight="bold" textAnchor="middle" x="11" y="13">{pin.kind === 'terrain' ? '↗' : pin.kind === 'character' ? '人' : '•'}</text>
            </g>
          </svg>}
        {!cluster && <span className="absolute left-1/2 top-full mt-0.5 block max-w-36 -translate-x-1/2 truncate rounded border border-border bg-popover/95 px-1.5 py-0.5 text-xs text-popover-foreground shadow-sm">{mapPinName(pin, entities, maps)}</span>}
      </button>
    </HoverCard.Trigger>
    <HoverCard.Portal><HoverCard.Content align="center" className="z-50 max-h-[min(24rem,80vh)] w-72 overflow-auto rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl" collisionPadding={12} onPointerDown={(event) => event.stopPropagation()} side="top" sideOffset={0}>
      {!cluster && pin.kind === 'terrain' ? target
        ? <button aria-label={`${target.name} 지도로 이동`} className="block w-full" onClick={() => onNavigate(target.id)} type="button"><img alt={`${target.name}의 저장된 핀 포함 미리보기`} className="max-h-64 w-full rounded object-contain" src={`/api/projects/${map.projectId}/maps/${target.id}?preview=1&v=${target.revision}`} /></button>
        : <Button onClick={() => onChoose(pin)} size="sm" type="button">복구</Button>
        : cluster
          ? <div className="space-y-1">{members.map((item) => <button className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground" key={item.id} onClick={() => { onChoose(item); setHover(false); }} type="button">{mapPinName(item, entities, maps)}</button>)}</div>
          : <div className="space-y-1">
            {entity?.imagePath && <img alt={entity.title} className="size-16 rounded-lg object-cover" src={entity.imagePath} />}
            <p className="font-semibold">{mapPinName(pin, entities, maps)}</p><p className="text-xs text-muted-foreground">{entity?.category} · {pin.status === 'inactive' ? '비활성' : '활성'}</p>
            <p className="line-clamp-2 text-sm">{entity?.summary || '등록된 요약이 없습니다.'}</p>
          </div>}
    </HoverCard.Content></HoverCard.Portal>
  </HoverCard.Root>;
}
