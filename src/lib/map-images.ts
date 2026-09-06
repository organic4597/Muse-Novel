import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { MapError } from '@/lib/db/queries/maps';
import { type MapEntity, type MapPin, pinColor } from '@/lib/maps';
import { createUploadWebPath, findExistingUploadPath, getUploadWritePath } from '@/lib/uploads/storage';

let processing = false;
export async function readMapUpload(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new MapError('업로드 파일이 없습니다.');
  const chunks: Uint8Array[] = []; let bytes = 0; let complete = false;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) { complete = true; break; }
      bytes += part.value.length;
      if (bytes > 13 * 1024 * 1024) throw new MapError('업로드 용량이 너무 큽니다.', 413);
      chunks.push(part.value);
    }
  } finally { if (!complete) await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}
export async function processMapImage(file: File, previous?: { width: number; height: number }, allowAspectChange = false) {
  if (!file.size || file.size > 12 * 1024 * 1024) throw new MapError('지도 이미지는 12MB 이하의 PNG, JPG, WebP 파일을 사용해주세요.');
  if (processing) throw new MapError('다른 지도 이미지를 처리 중입니다. 잠시 후 다시 시도해주세요.', 429);
  // ponytail: serialize rare uploads to bound decoder memory; per-worker queues only if upload traffic grows.
  processing = true;
  const written: string[] = [];
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const raster = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) ||
      (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP');
    if (!raster) throw new MapError('PNG, JPG, WebP 이미지 파일만 사용할 수 있습니다.');
    const input = sharp(buffer, { limitInputPixels: 32_000_000, animated: false });
    const metadata = await input.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) throw new MapError('정적인 PNG, JPG, WebP 이미지만 지원합니다.');
    const high = await input.rotate().resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    if (previous && !allowAspectChange && Math.abs((high.info.width / high.info.height) / (previous.width / previous.height) - 1) > 0.01) throw new MapError('ASPECT_RATIO_CHANGED: 새 이미지의 비율이 다릅니다. 정규화 좌표는 유지되지만 핀 위치를 다시 확인해야 합니다.', 409);
    const normal = await sharp(high.data).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
    const thumbnail = await sharp(high.data).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const prefix = crypto.randomUUID();
    const webPaths = ['display', '2x', 'thumb'].map((suffix) => createUploadWebPath('maps', `${prefix}-${suffix}.webp`));
    for (const [index, bytes] of [normal, high.data, thumbnail].entries()) {
      const diskPath = getUploadWritePath(webPaths[index]);
      await mkdir(path.dirname(diskPath), { recursive: true });
      written.push(webPaths[index]); await writeFile(diskPath, bytes, { flag: 'wx' });
    }
    return { imagePath: webPaths[0], image2xPath: webPaths[1], thumbnailPath: webPaths[2], width: high.info.width, height: high.info.height };
  } catch (error) {
    await removeMapImages(written);
    if (error instanceof MapError) throw error;
    throw new MapError('이미지를 읽거나 처리하지 못했습니다. 최대 3,200만 화소의 PNG, JPG, WebP를 사용해주세요.');
  } finally { processing = false; }
}

export function mapFailure(error: unknown) {
  return Response.json({ error: error instanceof MapError ? error.message : '지도 요청을 처리하지 못했습니다. 입력값과 중복된 이름을 확인해주세요.' }, { status: error instanceof MapError ? error.status : 400 });
}
export async function removeMapImages(paths: string[]) {
  for (const webPath of paths) {
    if (!/^\/uploads\/maps\/[a-f0-9-]+-(?:display|2x|thumb)\.webp$/.test(webPath)) continue;
    await unlink(getUploadWritePath(webPath)).catch(() => undefined);
  }
}
export async function mapPreviewSvg(thumbnailPath: string, size: { width: number; height: number }, pins: MapPin[], entities: MapEntity[] = []) {
  const image = await readFile(await findExistingUploadPath(thumbnailPath));
  const height = 480 * size.height / size.width;
  const markers = pins.map((pin) => {
    const color = pinColor(pin, entities);
    const head = pin.kind === 'terrain'
      ? `<path d="M0-15 6-9 0-3-6-9Z" fill="${color}" stroke="#111827" stroke-width="1"/>`
      : `<circle cx="0" cy="-9" r="5.5" fill="${color}" stroke="#111827" stroke-width="1"/>`;
    return `<g opacity="0.6" transform="translate(${(pin.x * 480).toFixed(2)} ${(pin.y * height).toFixed(2)})"><path d="M0 0V-4" stroke="#111827" stroke-width="1.2"/>${head}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${height}" viewBox="0 0 480 ${height}"><image width="480" height="${height}" href="data:image/webp;base64,${image.toString('base64')}"/>${markers}</svg>`;
}
