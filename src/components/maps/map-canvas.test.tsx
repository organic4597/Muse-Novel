import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapEntity, MapPin, WorldMap } from '@/lib/maps';
import { MapCanvas } from './map-canvas';

const map: WorldMap = { id: 'map-a', projectId: 'project', folderId: null, name: '대륙', imagePath: '/display.webp', image2xPath: '/2x.webp', thumbnailPath: '/thumb.webp', width: 1000, height: 500, revision: 1 };
const entity: MapEntity = { id: 'entry', kind: 'world', title: '왕국', category: '장소', summary: '요약', imagePath: null };
const pin = (id: string, x: number): MapPin => ({ id, kind: 'world', targetId: 'entry', label: '왕국', status: 'active', x, y: 0.5 });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
describe('map canvas draft interaction', () => {
  it('never zooms below the full-map fit scale', () => {
    render(<MapCanvas entities={[entity]} map={map} maps={[map]} onChange={vi.fn()} onNavigate={vi.fn()} onPlace={vi.fn()} onSelect={vi.fn()} pins={[]} placement={null} selected={[]} />);
    const zoomOut = screen.getByRole('button', { name: '지도 축소' });
    expect(screen.getByText(/^100%/)).toBeInTheDocument();
    expect(zoomOut).toBeDisabled();
    fireEvent.wheel(screen.getByTestId('map-viewport'), { deltaY: 1000 });
    expect(screen.getByText(/^100%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '지도 확대' }));
    expect(screen.getByText(/^140%/)).toBeInTheDocument();
    expect(zoomOut).toBeEnabled();
    fireEvent.click(zoomOut);
    expect(screen.getByText(/^100%/)).toBeInTheDocument();
  });

  it('places duplicate items without saving and exposes explicit keyboard-friendly placement', () => {
    const onPlace = vi.fn();
    const { rerender } = render(<MapCanvas entities={[entity]} map={map} maps={[map]} onChange={vi.fn()} onNavigate={vi.fn()} onPlace={onPlace} onSelect={vi.fn()} pins={[]} placement={{ kind: 'world', targetId: 'entry' }} selected={[]} />);
    Object.defineProperty(screen.getByTestId('map-viewport'), 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 800, height: 560 }) });
    fireEvent.pointerDown(screen.getByTestId('map-viewport'), { button: 0, clientX: 400, clientY: 280, pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: '화면 중앙에 배치' }));
    expect(onPlace).toHaveBeenCalledTimes(2);
    rerender(<MapCanvas entities={[entity]} map={map} maps={[map]} onChange={vi.fn()} onNavigate={vi.fn()} onPlace={onPlace} onSelect={vi.fn()} pins={[pin('a', 0.2), pin('b', 0.8)]} placement={null} selected={[]} />);
    expect(screen.getByRole('button', { name: '전체 핀 선택' })).toBeEnabled();
    expect(screen.getAllByTestId('map-pin')[0].querySelector('g')).toHaveAttribute('opacity', '0.6');
  });
  it('marquee selection updates live and right-button drag pans without changing pins', () => {
    const onSelect = vi.fn(); const onChange = vi.fn();
    render(<MapCanvas entities={[entity]} map={map} maps={[map]} onChange={onChange} onNavigate={vi.fn()} onPlace={vi.fn()} onSelect={onSelect} pins={[pin('a', 0.2), pin('b', 0.8)]} placement={null} selected={[]} />);
    const viewport = screen.getByTestId('map-viewport');
    Object.defineProperty(viewport, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 800, height: 560 }) });
    Object.defineProperty(viewport, 'setPointerCapture', { value: vi.fn() }); Object.defineProperty(viewport, 'hasPointerCapture', { value: () => false });
    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 180, pointerId: 1 });
    act(() => fireEvent.pointerMove(viewport, { clientX: 330, clientY: 390, pointerId: 1 }));
    expect(onSelect).toHaveBeenLastCalledWith(['a']);
    fireEvent.pointerUp(viewport, { clientX: 330, clientY: 390, pointerId: 1 });
    fireEvent.pointerDown(viewport, { button: 2, clientX: 300, clientY: 200, pointerId: 2 });
    act(() => fireEvent.pointerMove(viewport, { clientX: 350, clientY: 230, pointerId: 2 }));
    fireEvent.pointerUp(viewport, { clientX: 350, clientY: 230, pointerId: 2 });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('uses primary-button dragging for read-only navigation without selecting or moving pins', () => {
    const onSelect = vi.fn(); const onChange = vi.fn(); const onPinOpen = vi.fn();
    render(<MapCanvas entities={[entity]} map={map} maps={[map]} navigationOnly onChange={onChange} onNavigate={vi.fn()} onPinOpen={onPinOpen} onPlace={vi.fn()} onSelect={onSelect} pins={[pin('a', 0.2)]} placement={null} selected={[]} />);
    const viewport = screen.getByTestId('map-viewport');
    const image = screen.getByRole('img', { name: '대륙' });
    Object.defineProperty(viewport, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 800, height: 560 }) });
    Object.defineProperty(viewport, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(viewport, 'hasPointerCapture', { value: () => false });
    const before = image.getAttribute('style');
    fireEvent.pointerDown(viewport, { button: 0, clientX: 200, clientY: 180, pointerId: 7 });
    act(() => fireEvent.pointerMove(viewport, { clientX: 260, clientY: 220, pointerId: 7 }));
    fireEvent.pointerUp(viewport, { clientX: 260, clientY: 220, pointerId: 7 });
    expect(image.getAttribute('style')).not.toBe(before);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '전체 핀 선택' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('map-pin'));
    expect(onPinOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });
  it('shows only the selected item summary when an individual pin is not clustered', async () => {
    render(<MapCanvas entities={[entity]} map={map} maps={[map]} onChange={vi.fn()} onNavigate={vi.fn()} onPlace={vi.fn()} onSelect={vi.fn()} pins={[pin('a', 0.2)]} placement={null} selected={[]} />);
    const marker = screen.getByTestId('map-pin');
    fireEvent.pointerEnter(marker); fireEvent.pointerMove(marker);
    await waitFor(() => expect(screen.getByText('요약')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /왕국/ })).toHaveLength(1);
  });
  it('shows a selectable member list only when a visible cluster exists', async () => {
    render(<MapCanvas entities={[entity]} map={map} maps={[map]} onChange={vi.fn()} onNavigate={vi.fn()} onPlace={vi.fn()} onSelect={vi.fn()} pins={[pin('a', 0.2), pin('b', 0.201)]} placement={null} selected={[]} />);
    const cluster = screen.getByTestId('map-cluster');
    fireEvent.pointerEnter(cluster); fireEvent.pointerMove(cluster);
    await waitFor(() => expect(screen.getAllByRole('button', { name: '왕국' })).toHaveLength(2));
  });
});
