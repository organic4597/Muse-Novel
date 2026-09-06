import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { assertMapFolder, getWorldMap, listMapEntities, listMapPins, MapError, saveMapPins } from '@/lib/db/queries/maps';
import { worldMaps } from '@/lib/db/schema';
import { mapFailure, mapPreviewSvg, processMapImage, readMapUpload, removeMapImages } from '@/lib/map-images';
import { mapNameSchema } from '@/lib/maps';

type Context = { params: Promise<{ id: string; mapId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const { id, mapId } = await params;
    const map = getWorldMap(db, id, mapId); const pins = listMapPins(db, mapId);
    if (new URL(request.url).searchParams.get('preview') === '1') return new Response(await mapPreviewSvg(map.thumbnailPath, map, pins, listMapEntities(db, id)), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=10', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src data:;" },
    });
    return Response.json({ map, pins });
  } catch (error) { return mapFailure(error); }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const { id, mapId } = await params;
    const body = z.object({ revision: z.number().int().positive(), pins: z.unknown() }).parse(await request.json());
    return Response.json(saveMapPins(db, id, mapId, body));
  } catch (error) { return mapFailure(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, mapId } = await params; getWorldMap(db, id, mapId);
    const body = z.object({ name: mapNameSchema.optional(), folderId: z.string().uuid().nullable().optional() }).strict().parse(await request.json());
    if (body.folderId !== undefined) assertMapFolder(db, id, body.folderId);
    return Response.json(db.update(worldMaps).set({ ...body, updatedAt: new Date() }).where(eq(worldMaps.id, mapId)).returning().all()[0]);
  } catch (error) { return mapFailure(error); }
}
export async function POST(request: Request, { params }: Context) {
  let image: Awaited<ReturnType<typeof processMapImage>> | undefined;
  try {
    const { id, mapId } = await params; const original = getWorldMap(db, id, mapId);
    if (Number(request.headers.get('content-length')) > 13 * 1024 * 1024) throw new MapError('업로드 용량이 너무 큽니다.', 413);
    const form = await readMapUpload(request); const revision = z.coerce.number().int().positive().parse(form.get('revision'));
    if (original.revision !== revision) throw new MapError('지도가 변경되었습니다. 다시 불러온 후 교체해주세요.', 409);
    const file = form.get('image'); if (!file || typeof file === 'string') throw new MapError('이미지를 선택해주세요.');
    image = await processMapImage(file, original, form.get('allowAspectChange') === 'true');
    const next = db.transaction((tx: typeof db) => {
      if (getWorldMap(tx, id, mapId).revision !== revision) throw new MapError('처리 중 지도가 변경되었습니다. 다시 시도해주세요.', 409);
      return tx.update(worldMaps).set({ ...image, revision: revision + 1, updatedAt: new Date() }).where(eq(worldMaps.id, mapId)).returning().all()[0];
    }, { behavior: 'immediate' });
    await removeMapImages([original.imagePath, original.image2xPath, original.thumbnailPath]);
    return Response.json({ map: next, pins: listMapPins(db, mapId) });
  } catch (error) { if (image) await removeMapImages([image.imagePath, image.image2xPath, image.thumbnailPath]); return mapFailure(error); }
}
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, mapId } = await params; const map = getWorldMap(db, id, mapId);
    db.delete(worldMaps).where(eq(worldMaps.id, mapId)).run();
    await removeMapImages([map.imagePath, map.image2xPath, map.thumbnailPath]);
    return Response.json({ success: true });
  } catch (error) { return mapFailure(error); }
}
