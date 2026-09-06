import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { assertMapFolder, listMapEntities, listMaps, MapError, updateMapPalette } from '@/lib/db/queries/maps';
import { getProject } from '@/lib/db/queries/projects';
import { mapFolders, worldMaps } from '@/lib/db/schema';
import { mapFailure, processMapImage, readMapUpload, removeMapImages } from '@/lib/map-images';
import { mapNameSchema, pinColorSchema } from '@/lib/maps';

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!await getProject(db, id)) return Response.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
  return Response.json({ ...listMaps(db, id), entities: listMapEntities(db, id) });
}
export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!await getProject(db, id)) throw new MapError('작품을 찾을 수 없습니다.', 404);
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      if (Number(request.headers.get('content-length')) > 13 * 1024 * 1024) throw new MapError('업로드 용량이 너무 큽니다.', 413);
      const form = await readMapUpload(request);
      const name = mapNameSchema.parse(form.get('name'));
      const folderId = form.get('folderId') ? z.string().uuid().parse(form.get('folderId')) : null;
      assertMapFolder(db, id, folderId);
      const file = form.get('image');
      if (!file || typeof file === 'string') throw new MapError('지도 이미지를 선택해주세요.');
      const image = await processMapImage(file);
      try {
        const map = db.insert(worldMaps).values({ projectId: id, folderId, name, ...image }).returning().all()[0];
        return Response.json({ map, pins: [] });
      } catch (error) { await removeMapImages([image.imagePath, image.image2xPath, image.thumbnailPath]); throw error; }
    }
    const body = z.discriminatedUnion('action', [
      z.object({ action: z.literal('folder-create'), name: mapNameSchema }),
      z.object({ action: z.literal('folder-rename'), folderId: z.string().uuid(), name: mapNameSchema }),
      z.object({ action: z.literal('folder-delete'), folderId: z.string().uuid() }),
      z.object({ action: z.literal('palette-add'), color: pinColorSchema }),
      z.object({ action: z.literal('palette-delete'), color: pinColorSchema }),
    ]).parse(await request.json());
    if ('name' in body && body.name === '미분류') throw new MapError('미분류는 기본 그룹이므로 생성하거나 이름을 지정할 수 없습니다.');
    if (body.action === 'palette-add' || body.action === 'palette-delete') {
      updateMapPalette(db, id, body.action === 'palette-add' ? 'add' : 'delete', body.color);
    } else if (body.action === 'folder-create') {
      const last = db.select({ order: mapFolders.order }).from(mapFolders).where(eq(mapFolders.projectId, id)).orderBy(desc(mapFolders.order)).limit(1).get();
      db.insert(mapFolders).values({ projectId: id, name: body.name, order: (last?.order ?? 0) + 1 }).run();
    } else {
      assertMapFolder(db, id, body.folderId);
      const where = and(eq(mapFolders.projectId, id), eq(mapFolders.id, body.folderId));
      if (body.action === 'folder-rename') db.update(mapFolders).set({ name: body.name }).where(where).run();
      else db.delete(mapFolders).where(where).run(); // FK SET NULL preserves the folder's maps.
    }
    return Response.json(listMaps(db, id));
  } catch (error) { return mapFailure(error); }
}
