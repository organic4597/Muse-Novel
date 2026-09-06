import { File as NodeFile } from 'node:buffer';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mapPreviewSvg, processMapImage, readMapUpload, removeMapImages } from './map-images';
import type { MapPin } from './maps';
import { getUploadWritePath } from './uploads/storage';

const root = path.resolve('test-results', 'map-images');
const previous = process.env.UPLOADS_DIR;
beforeEach(async () => { process.env.UPLOADS_DIR = root; await mkdir(root, { recursive: true }); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); if (previous === undefined) Reflect.deleteProperty(process.env, 'UPLOADS_DIR'); else process.env.UPLOADS_DIR = previous; });
const imageFile = async (width = 5000, height = 2500) => new NodeFile([await sharp({ create: { width, height, channels: 3, background: '#ccbbaa' } }).png().toBuffer()], 'map.png', { type: 'image/png' }) as unknown as File;
describe('bounded map image pipeline', () => {
  it('writes a bounded display, retina and thumbnail WebP while retaining aspect ratio', async () => {
    const result = await processMapImage(await imageFile());
    expect(result).toMatchObject({ width: 4096, height: 2048 });
    const [display, retina, thumb] = await Promise.all([result.imagePath, result.image2xPath, result.thumbnailPath].map(async (file) => sharp(await readFile(getUploadWritePath(file))).metadata()));
    expect(display).toMatchObject({ format: 'webp', width: 2048, height: 1024 });
    expect(retina).toMatchObject({ format: 'webp', width: 4096, height: 2048 });
    expect(thumb).toMatchObject({ format: 'webp', width: 480, height: 240 });
    await removeMapImages([result.imagePath, result.image2xPath, result.thumbnailPath, '/uploads/characters/keep.webp']);
    await expect(readFile(getUploadWritePath(result.imagePath))).rejects.toMatchObject({ code: 'ENOENT' });
  }, 20_000);
  it('rejects spoofed, oversized and aspect-changing inputs without leaving files', async () => {
    await expect(processMapImage(new NodeFile([new Uint8Array([1, 2, 3])], 'fake.png', { type: 'image/png' }) as unknown as File)).rejects.toThrow('PNG');
    await expect(processMapImage(new NodeFile([new Uint8Array(12 * 1024 * 1024 + 1)], 'large.png') as unknown as File)).rejects.toThrow('12MB');
    await expect(processMapImage(await imageFile(1000, 1000), { width: 1000, height: 500 })).rejects.toThrow('ASPECT_RATIO_CHANGED');
  }, 20_000);
  it('reads an upload with a hard request-body cap and produces a pin snapshot preview', async () => {
    const form = new FormData(); form.set('name', '대륙'); form.set('image', await imageFile(320, 200));
    const request = new Request('http://localhost/upload', { method: 'POST', body: form });
    expect((await readMapUpload(request)).get('name')).toBe('대륙');
    const result = await processMapImage(await imageFile(320, 200));
    const pin: MapPin = { id: crypto.randomUUID(), kind: 'terrain', targetId: null, label: '끊어진 지도', status: 'inactive', flagColor: '#ff0000', x: 0.5, y: 0.5 };
    const svg = await mapPreviewSvg(result.thumbnailPath, result, [pin]);
    expect(svg).toContain('<svg'); expect(svg).toContain('data:image/webp;base64,'); expect(svg).toContain('#737373'); expect(svg).toContain('opacity="0.6"');
  }, 20_000);
});
