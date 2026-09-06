import { describe, expect, it } from 'vitest';
import { identifyWebReference, loadWebReferenceSites } from './catalog';

describe('reference source catalog', () => {
  it('registers the requested sources and distinguishes the three Arca channels', async () => {
    const sites = await loadWebReferenceSites();
    for (const id of ['namu', 'dc-genre', 'arca-genre', 'arca-total', 'arca-writing', 'world-anvil', 'story-plotter', 'wikipedia', 'baidu-baike', 'chgis', 'ctext']) {
      expect(sites.some((site) => site.id === id)).toBe(true);
    }
    expect(identifyWebReference('https://arca.live/b/webfiction/123', sites)?.id).toBe('arca-writing');
    expect(identifyWebReference('https://arca.live/b/novelchannel/456', sites)?.id).toBe('arca-genre');
    expect(identifyWebReference('https://arca.live/b/totalnovel/789', sites)?.id).toBe('arca-total');
    expect(identifyWebReference('https://arca.live.evil.example/b/webfiction/123', sites)).toBeUndefined();
    expect(identifyWebReference('https://arca.live/b/webfiction-fake/123', sites)).toBeUndefined();
  });
});
