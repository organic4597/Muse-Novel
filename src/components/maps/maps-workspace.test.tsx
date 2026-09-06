import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapPin } from '@/lib/maps';
import { MapsWorkspace } from './maps-workspace';

vi.mock('./map-canvas', () => ({ MapCanvas: ({ pins, onPlace, onSelect }: {
  pins: MapPin[]; onPlace: (placement: { kind: 'world'; targetId: string }, point: { x: number; y: number }) => void; onSelect: (ids: string[]) => void;
}) => <div data-testid="mock-map"><span data-testid="mock-pin-count">{pins.length}</span><button onClick={() => onPlace({ kind: 'world', targetId: 'entry' }, { x: 0.2 + pins.length * 0.1, y: 0.3 })} type="button">테스트 핀 배치</button>
  <button disabled={!pins.length} onClick={() => onSelect([pins[0].id])} type="button">첫 핀 선택</button></div> }));
vi.mock('@/components/world/world-builder-assistant', () => ({ WorldBuilderAssistant: ({ onEntriesAdded }: {
  onEntriesAdded: (entries: Array<{ id: string; title: string; category: string; content: string }>) => void;
}) => <button onClick={() => onEntriesAdded([{ id: 'approved', title: '새 왕국', category: '장소', content: '승인된 세계관 설명' }])} type="button">테스트 세계관 승인</button> }));
vi.mock('@/components/world/world-entry-form', () => ({ WorldEntryForm: ({ onSuccess }: { onSuccess: (entry: Record<string, unknown>) => void }) =>
  <button onClick={() => onSuccess({ id: 'entry', projectId: 'project', title: '수정된 왕국', category: '지역', content: '수정된 설명', researchJson: null, tags: [{ id: 'tag', tag: '왕국' }] })} type="button">테스트 세계관 수정 저장</button> }));
vi.mock('@/components/character/character-form', () => ({ CharacterForm: ({ onSuccess }: { onSuccess: (entry: Record<string, unknown>) => void }) =>
  <button onClick={() => onSuccess({ id: 'character', projectId: 'project', name: '수정된 인물', role: '조연', backstory: '수정된 배경' })} type="button">테스트 캐릭터 수정 저장</button> }));

const map = { id: 'map', projectId: 'project', folderId: 'folder', name: '대륙', imagePath: '/display.webp', image2xPath: '/2x.webp', thumbnailPath: '/thumb.webp', width: 1000, height: 500, revision: 1 };
const catalog = { maps: [map], folders: [{ id: 'folder', name: '대륙 지도', order: 1 }], links: [], entities: [{ id: 'entry', kind: 'world', title: '왕국', category: '장소', summary: '왕국 설명', imagePath: null }] };
const detail = { map, pins: [] };
beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('prompt', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('map workspace draft boundary', () => {
  it('reuses the existing world form and updates every mapped label after editing the source item', async () => {
    const existingPin: MapPin = { id: 'pin', kind: 'world', targetId: 'entry', label: '왕국', status: 'active', x: 0.5, y: 0.5 };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/maps') && !init?.method) return Response.json(catalog);
      if (url.endsWith('/maps/map') && !init?.method) return Response.json({ map, pins: [existingPin] });
      if (url.includes('/maps/entity')) return Response.json({ entry: { id: 'entry', projectId: 'project', title: '왕국', category: '장소', content: '기존 설명', researchJson: null }, tags: [], related: [] });
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MapsWorkspace projectId="project" />);
    await screen.findByTestId('mock-map');
    fireEvent.click(screen.getByRole('button', { name: '첫 핀 선택' }));
    fireEvent.click(await screen.findByRole('button', { name: '원본 항목 수정' }));
    expect(screen.getByRole('heading', { name: '세계관 항목 수정' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '테스트 세계관 수정 저장' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '세계관 항목 수정' })).not.toBeInTheDocument());
    expect(screen.getAllByText('수정된 왕국').length).toBeGreaterThan(0);
    expect(screen.getByText('수정된 설명')).toBeInTheDocument();
  });

  it('automatically loads each map positions and exposes an explicit reload action', async () => {
    const second = { ...map, id: 'second', name: '지역 지도', folderId: null, revision: 3 };
    const secondPin: MapPin = { id: 'pin', kind: 'world', targetId: 'entry', label: '왕국', status: 'active', x: 0.72, y: 0.31 };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/maps') && !init?.method) return Response.json({ ...catalog, maps: [map, second] });
      if (url.endsWith('/maps/map') && !init?.method) return Response.json(detail);
      if (url.endsWith('/maps/second') && !init?.method) return Response.json({ map: second, pins: [secondPin] });
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MapsWorkspace projectId="project" />);
    await screen.findByTestId('mock-map');
    fireEvent.click(screen.getByRole('button', { name: '지역 지도' }));
    await waitFor(() => expect(screen.getByTestId('mock-pin-count')).toHaveTextContent('1'));
    expect(screen.getByText('1개 저장된 핀 위치를 불러왔습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '저장된 핀 위치 불러오기' }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/maps/second'))).toHaveLength(2));
  });

  it('adds approved World assistant entries to the placement list without reloading', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/maps') && !init?.method) return Response.json(catalog);
      if (url.endsWith('/maps/map') && !init?.method) return Response.json(detail);
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MapsWorkspace projectId="project" />);
    await screen.findByTestId('mock-map');
    expect(screen.getByLabelText('지도 목록').parentElement).toHaveClass('lg:grid-cols-[15rem_minmax(0,1fr)]', 'xl:grid-cols-[15rem_minmax(0,1fr)_19rem]');
    const remote = screen.getByRole('button', { name: 'World assistant 열기' });
    fireEvent.pointerEnter(screen.getByTestId('world-assistant-remote'));
    expect(remote).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(remote);
    await waitFor(() => expect(screen.getByRole('button', { name: '테스트 세계관 승인' })).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: '테스트 세계관 승인' }));
    expect(screen.getByText('새 왕국')).toBeInTheDocument();
    expect(screen.getByText('1개 세계관 항목을 승인했습니다. 배치할 항목 목록에 추가했습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'World assistant 닫기' }));
    expect(screen.getByRole('button', { name: 'World assistant 열기' })).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('[data-slot="popover-content"]')).toHaveAttribute('data-state', 'closed');
    expect(screen.getByRole('button', { name: '테스트 세계관 승인', hidden: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'World assistant 열기' }));
    expect(screen.getByRole('button', { name: 'World assistant 열기' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'World assistant 열기' }));
    expect(screen.getByRole('button', { name: 'World assistant 열기' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves a map by dragging it onto unclassified while retaining the select fallback', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/maps') && !init?.method) return Response.json(catalog);
      if (url.endsWith('/maps/map') && !init?.method) return Response.json(detail);
      if (url.endsWith('/maps/map') && init?.method === 'PATCH') return Response.json({ ...map, folderId: null });
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MapsWorkspace projectId="project" />);
    const row = await screen.findByTestId('map-row-map');
    const target = screen.getByTestId('map-folder-unclassified');
    const values = new Map<string, string>();
    const dataTransfer = {
      dropEffect: 'none', effectAllowed: 'none', files: [], items: [], types: [],
      clearData: () => values.clear(), getData: (type: string) => values.get(type) ?? '', setData: (type: string, value: string) => values.set(type, value), setDragImage: vi.fn(),
    } as unknown as DataTransfer;
    fireEvent.dragStart(row, { dataTransfer });
    expect(row).toHaveClass('opacity-45');
    fireEvent.dragEnter(target, { dataTransfer });
    expect(target).toHaveClass('ring-2');
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/project/maps/map', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ folderId: null }),
    })));
    expect(await screen.findByText('“대륙” 지도를 “미분류”로 이동했습니다.')).toBeInTheDocument();
    expect(screen.getByLabelText('현재 지도 폴더 이동')).toHaveValue('');
  });

  it('allows duplicate placement and inactive state, but writes only after Save', async () => {
    let savedPins: MapPin[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/maps') && !init?.method) return Response.json(catalog);
      if (url.endsWith('/maps/map') && !init?.method) return Response.json(detail);
      if (url.endsWith('/maps/map') && init?.method === 'PUT') {
        savedPins = JSON.parse(String(init.body)).pins;
        return Response.json({ map: { ...map, revision: 2 }, pins: savedPins });
      }
      if (url.includes('/maps/entity')) return Response.json({ entry: { title: '왕국', category: '장소', content: '설명' }, tags: [], related: [] });
      throw new Error(`unexpected ${url} ${init?.method}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MapsWorkspace projectId="project" />);
    await screen.findByTestId('mock-map');
    fireEvent.click(screen.getByRole('button', { name: '테스트 핀 배치' }));
    fireEvent.click(screen.getByRole('button', { name: '테스트 핀 배치' }));
    expect(screen.getByText('저장하지 않은 변경 있음')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '첫 핀 선택' }));
    expect(screen.getAllByRole('button', { name: /기본 팔레트 .* 핀 색상 선택/ })).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: /사용자 팔레트 \d+ 추가/ })).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: '기본 팔레트 빨강 핀 색상 선택' }));
    expect(screen.getByText('#EF4444')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: '핀 활성 상태' }));
    fireEvent.click(screen.getByRole('button', { name: /^저장$/ }));
    await waitFor(() => expect(savedPins).toHaveLength(2));
    expect(savedPins.map((pin) => pin.targetId)).toEqual(['entry', 'entry']);
    expect(savedPins[0].status).toBe('inactive');
    expect(savedPins[0].flagColor).toBe('#ef4444');
    expect(screen.getByText('저장된 상태')).toBeInTheDocument();
  });

  it('adds a project palette color into the first empty slot and applies it to the current pin', async () => {
    const existingPin: MapPin = { id: 'pin', kind: 'world', targetId: 'entry', label: '왕국', status: 'active', x: 0.5, y: 0.5 };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/maps') && !init?.method) return Response.json({ ...catalog, palette: [] });
      if (url.endsWith('/maps/map') && !init?.method) return Response.json({ map, pins: [existingPin] });
      if (url.includes('/maps/entity')) return Response.json({ entry: { id: 'entry', title: '왕국', category: '장소', content: '설명' }, tags: [], related: [] });
      if (url.endsWith('/maps') && init?.method === 'POST') return Response.json({ ...catalog, palette: ['#123456'] });
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MapsWorkspace projectId="project" />);
    await screen.findByTestId('mock-map'); fireEvent.click(screen.getByRole('button', { name: '첫 핀 선택' }));
    fireEvent.change(screen.getByLabelText('새 사용자 팔레트 색상'), { target: { value: '#123456' } });
    expect(await screen.findByRole('button', { name: '사용자 색상 1 핀 색상 선택' })).toBeInTheDocument();
    expect(screen.getAllByText('#123456')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /사용자 팔레트 \d+ 추가/ })).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project/maps', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'palette-add', color: '#123456' }),
    }));
  });

  it('moves folder maps to unclassified on confirmed folder deletion', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/maps') && !init?.method) return Response.json(catalog);
      if (url.endsWith('/maps/map') && !init?.method) return Response.json(detail);
      if (url.endsWith('/maps') && init?.method === 'POST') return Response.json({ ...catalog, folders: [], maps: [{ ...map, folderId: null }] });
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MapsWorkspace projectId="project" />);
    await screen.findAllByText('대륙 지도');
    fireEvent.click(screen.getByRole('button', { name: '폴더 삭제' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/project/maps', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'folder-delete', folderId: 'folder' }) })));
    expect(confirm).toHaveBeenCalledWith('“대륙 지도” 폴더만 삭제할까요? 지도는 모두 미분류로 이동합니다.');
  });

  it('preserves the draft when a stale save is rejected', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/maps') && !init?.method) return Response.json(catalog);
      if (url.endsWith('/maps/map') && !init?.method) return Response.json(detail);
      if (init?.method === 'PUT') return Response.json({ error: '다른 화면에서 지도가 변경되었습니다.' }, { status: 409 });
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MapsWorkspace projectId="project" />);
    await screen.findByTestId('mock-map'); fireEvent.click(screen.getByRole('button', { name: '테스트 핀 배치' }));
    fireEvent.click(screen.getByRole('button', { name: /^저장$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('다른 화면');
    expect(screen.getByText('저장하지 않은 변경 있음')).toBeInTheDocument();
  });
});
