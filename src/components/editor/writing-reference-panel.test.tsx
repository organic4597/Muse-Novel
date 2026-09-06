import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WritingReferencePanel } from './writing-reference-panel';

describe('WritingReferencePanel', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      disconnect() {}
      observe() {}
      unobserve() {}
    });
  });
  it('keeps world and map references separate, summarizes on hover and opens the full world dialog', async () => {
    const map = { id: 'map', projectId: 'project', folderId: null, name: '중원', imagePath: '/map.webp', image2xPath: '/map-2x.webp', thumbnailPath: '/thumb.webp', width: 1000, height: 500, revision: 1 };
    const entities = [
      { id: 'first', kind: 'world', title: '소림사', category: '종파', summary: '숭산의 문파', imagePath: null },
      { id: 'second', kind: 'world', title: '무당파', category: '종파', summary: '태극검의 본산', imagePath: null },
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/maps')) return Response.json({ maps: [map], entities });
      if (url.endsWith('/world-categories')) return Response.json([{ name: '종파' }]);
      if (url.includes('/maps/entity?')) return Response.json({ entry: { id: 'second', projectId: 'project', title: '무당파', category: '종파', content: '태극검의 본산', researchJson: null, createdAt: null, updatedAt: null }, tags: [], related: [] });
      if (url.endsWith('/links')) return Response.json({ incoming: [], outgoing: [] });
      if (url.includes('/world-entries')) return Response.json([]);
      return Response.json({ map, pins: [{ id: 'pin', kind: 'world', targetId: 'second', label: '무당파', status: 'active', x: 0.4, y: 0.6 }] });
    }));
    render(<WritingReferencePanel onCloseMap={vi.fn()} onCloseWorld={vi.fn()} projectId="project" showMap showWorld />);
    const worldPanel = await screen.findByRole('complementary', { name: '집필 세계관 항목' });
    expect(worldPanel).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '집필 미니맵' })).toBeInTheDocument();
    const worldEntryButton = within(worldPanel).getByRole('button', { name: /무당파/ });
    fireEvent.pointerEnter(worldEntryButton);
    fireEvent.pointerMove(worldEntryButton);
    expect(await screen.findByText('태극검의 본산')).toBeInTheDocument();
    fireEvent.click(worldEntryButton);
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByRole('heading', { name: '무당파' })).toBeInTheDocument();
  });

  it('enlarges the minimap and provides zoom controls', async () => {
    const map = { id: 'map', projectId: 'project', folderId: null, name: '중원', imagePath: '/map.webp', image2xPath: '/map-2x.webp', thumbnailPath: '/thumb.webp', width: 1000, height: 500, revision: 1 };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/maps')
      ? Response.json({ maps: [map], entities: [] })
      : url.endsWith('/world-categories')
        ? Response.json([])
        : Response.json({ map, pins: [] })));
    render(<WritingReferencePanel onCloseMap={vi.fn()} onCloseWorld={vi.fn()} projectId="project" showMap showWorld={false} />);
    expect(await screen.findByRole('img', { name: '중원' })).toHaveAttribute('src', '/map.webp');
    fireEvent.click(screen.getByRole('button', { name: '미니맵 확대' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('img', { name: '중원' })).toHaveAttribute('src', '/map-2x.webp');
    fireEvent.click(within(dialog).getByRole('button', { name: '지도 확대' }));
    expect(within(dialog).getByText(/^140%/)).toBeInTheDocument();
  });
});
