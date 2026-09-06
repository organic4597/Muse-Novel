import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WritingReferencePanel } from './writing-reference-panel';

describe('WritingReferencePanel', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('previews world entries on hover and reuses saved map coordinates as a minimap', async () => {
    const map = { id: 'map', projectId: 'project', folderId: null, name: '중원', imagePath: '/map.webp', image2xPath: '/map-2x.webp', thumbnailPath: '/thumb.webp', width: 1000, height: 500, revision: 1 };
    const entities = [
      { id: 'first', kind: 'world', title: '소림사', category: '종파', summary: '숭산의 문파', imagePath: null },
      { id: 'second', kind: 'world', title: '무당파', category: '종파', summary: '태극검의 본산', imagePath: null },
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/maps')
      ? Response.json({ maps: [map], entities })
      : Response.json({ map, pins: [{ id: 'pin', kind: 'world', targetId: 'second', label: '무당파', status: 'active', x: 0.4, y: 0.6 }] })));
    render(<WritingReferencePanel onClose={vi.fn()} projectId="project" />);
    fireEvent.mouseEnter(await screen.findByRole('button', { name: /무당파/ }));
    expect(screen.getByText('태극검의 본산')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '미니맵' }));
    expect(await screen.findByRole('img', { name: '중원' })).toHaveAttribute('src', '/map.webp');
    expect(screen.getByRole('button', { name: '무당파' })).toHaveStyle({ left: '40%', top: '60%' });
  });
});
