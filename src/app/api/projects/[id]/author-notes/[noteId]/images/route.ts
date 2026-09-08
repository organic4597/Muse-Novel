import {
  processAuthorNoteImage,
  readAuthorNoteUpload,
  removeAuthorNoteImages,
} from '@/lib/author-notebook-images';
import { db } from '@/lib/db';
import {
  addAuthorNoteAsset,
  AuthorNotebookError,
  authorNotebookFailure,
  getAuthorNote,
} from '@/lib/db/queries/author-notebook';

type Context = { params: Promise<{ id: string; noteId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { id, noteId } = await params;
    const note = getAuthorNote(db, id, noteId);
    if (!note) throw new AuthorNotebookError('작가 노트를 찾을 수 없습니다.', 404);
    if (note.kind !== 'mindmap') {
      throw new AuthorNotebookError('이미지는 마인드맵 노트에 추가할 수 있습니다.');
    }
    const form = await readAuthorNoteUpload(request);
    const file = form.get('image');
    if (!file || typeof file === 'string') {
      throw new AuthorNotebookError('추가할 이미지를 선택해주세요.');
    }
    const processed = await processAuthorNoteImage(file);
    try {
      const asset = addAuthorNoteAsset(db, id, noteId, processed.imagePath);
      return Response.json({ asset, ...processed });
    } catch (error) {
      await removeAuthorNoteImages([processed.imagePath]);
      throw error;
    }
  } catch (error) {
    return authorNotebookFailure(error);
  }
}
