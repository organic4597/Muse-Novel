'use client';

import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  Network,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AuthorNotebookFolder = {
  id: string;
  name: string;
  order: number;
};

export type AuthorNotebookNote = {
  contentJson: string;
  folderId: string | null;
  id: string;
  kind: 'text' | 'mindmap';
  order: number;
  projectId: string;
  title: string;
  updatedAt: string;
};

type NotebookData = {
  folders: AuthorNotebookFolder[];
  notes: AuthorNotebookNote[];
};

export type AuthorNotebookSidebarProps = {
  onOpenExamples?: () => void;
  onSelectNote: (note: AuthorNotebookNote | null) => void;
  projectId: string;
  refreshToken?: number;
  selectedNoteId: string | null;
};

export function AuthorNotebookSidebar({
  onOpenExamples,
  onSelectNote,
  projectId,
  refreshToken = 0,
  selectedNoteId,
}: AuthorNotebookSidebarProps) {
  const [data, setData] = useState<NotebookData>({ folders: [], notes: [] });
  const [expanded, setExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set()
  );
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/author-notes`);
    if (!response.ok) return;
    const notebook = (await response.json()) as NotebookData;
    setData(notebook);
    setExpandedFolders((current) => {
      if (current.size > 0) return current;
      return new Set(notebook.folders.map((folder) => folder.id));
    });
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const mutate = async (body: Record<string, unknown>) => {
    setCreating(true);
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/author-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as NotebookData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? '작가 노트를 변경하지 못했습니다.');
      setData(result);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '요청에 실패했습니다.');
      return null;
    } finally {
      setCreating(false);
    }
  };

  const createFolder = async () => {
    const name = window.prompt('새 폴더 이름', '새 구상 폴더')?.trim();
    if (!name) return;
    const result = await mutate({ action: 'folder-create', name });
    const folder = result?.folders.find((item) => item.name === name);
    if (folder) {
      setExpandedFolders((current) => new Set(current).add(folder.id));
    }
  };

  const createNote = async (
    kind: AuthorNotebookNote['kind'],
    folderId: string | null
  ) => {
    const fallback = kind === 'mindmap' ? '새 마인드맵' : '새 구상 노트';
    const title = window.prompt('노트 제목', fallback)?.trim();
    if (!title) return;
    const previousIds = new Set(data.notes.map((note) => note.id));
    const result = await mutate({
      action: 'note-create',
      folderId,
      kind,
      title,
    });
    const created = result?.notes.find((note) => !previousIds.has(note.id));
    if (created) onSelectNote(created);
  };

  const renameFolder = async (folder: AuthorNotebookFolder) => {
    const name = window.prompt('폴더 이름 변경', folder.name)?.trim();
    if (!name || name === folder.name) return;
    await mutate({ action: 'folder-rename', folderId: folder.id, name });
  };

  const deleteFolder = async (folder: AuthorNotebookFolder) => {
    if (!window.confirm(`“${folder.name}” 폴더를 삭제할까요? 내부 노트는 미분류로 이동합니다.`)) return;
    await mutate({ action: 'folder-delete', folderId: folder.id });
  };

  const deleteNote = async (note: AuthorNotebookNote) => {
    if (!window.confirm(`“${note.title}” 노트를 삭제할까요?`)) return;
    const response = await fetch(
      `/api/projects/${projectId}/author-notes/${note.id}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      setMessage('노트를 삭제하지 못했습니다.');
      return;
    }
    if (selectedNoteId === note.id) onSelectNote(null);
    await load();
  };

  const renameNote = async (note: AuthorNotebookNote) => {
    const title = window.prompt('노트 제목 변경', note.title)?.trim();
    if (!title || title === note.title) return;
    const response = await fetch(
      `/api/projects/${projectId}/author-notes/${note.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }
    );
    if (response.ok) await load();
  };

  const renderNote = (note: AuthorNotebookNote) => (
    <li className="group/note flex items-center gap-1" key={note.id}>
      <button
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
          selectedNoteId === note.id
            ? 'bg-primary/10 font-semibold text-foreground'
            : 'text-muted-foreground'
        )}
        onClick={() => onSelectNote(note)}
        type="button"
      >
        {note.kind === 'mindmap' ? (
          <Network className="size-3.5 shrink-0 text-primary" />
        ) : (
          <FileText className="size-3.5 shrink-0 text-primary" />
        )}
        <span className="truncate">{note.title}</span>
      </button>
      <button
        aria-label="노트 이름 변경"
        className="rounded p-1 text-muted-foreground/60 opacity-100 hover:text-foreground sm:opacity-0 sm:group-hover/note:opacity-100"
        onClick={() => renameNote(note)}
        type="button"
      >
        <Pencil className="size-3" />
      </button>
      <button
        aria-label="노트 삭제"
        className="rounded p-1 text-muted-foreground/60 opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover/note:opacity-100"
        onClick={() => deleteNote(note)}
        type="button"
      >
        <Trash2 className="size-3" />
      </button>
    </li>
  );

  const unfiled = data.notes.filter((note) => !note.folderId);

  return (
    <section className="muse-panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-3">
        <button
          aria-label={expanded ? '작가 노트 접기' : '작가 노트 펼치기'}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <NotebookPen className="size-4 text-primary" />
        <h2 className="min-w-0 flex-1 font-heading text-sm font-semibold">작가 노트</h2>
        <Button aria-label="노트 폴더 추가" disabled={creating} onClick={createFolder} size="icon-sm" variant="ghost">
          <FolderPlus />
        </Button>
        <Button aria-label="구상 노트 추가" disabled={creating} onClick={() => createNote('text', null)} size="icon-sm" variant="ghost">
          <Plus />
        </Button>
      </div>
      {expanded && (
        <div className="max-h-[38vh] space-y-2 overflow-y-auto p-3">
          {onOpenExamples && <button onClick={onOpenExamples} type="button" className="w-full rounded-lg border border-border p-2 text-left text-xs text-primary">문체·편집 사례</button>}
          {data.folders.map((folder) => {
            const folderNotes = data.notes.filter((note) => note.folderId === folder.id);
            const isOpen = expandedFolders.has(folder.id);
            return (
              <div key={folder.id}>
                <div className="group/folder flex items-center gap-1 rounded-lg hover:bg-muted/40">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-left text-xs font-medium"
                    onClick={() =>
                      setExpandedFolders((current) => {
                        const next = new Set(current);
                        if (next.has(folder.id)) next.delete(folder.id);
                        else next.add(folder.id);
                        return next;
                      })
                    }
                    type="button"
                  >
                    {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    <Folder className="size-3.5 text-primary/80" />
                    <span className="truncate">{folder.name}</span>
                    <span className="text-[10px] text-muted-foreground">{folderNotes.length}</span>
                  </button>
                  <button aria-label="폴더에 텍스트 노트 추가" className="rounded p-1 text-muted-foreground hover:text-primary" onClick={() => createNote('text', folder.id)} type="button"><FileText className="size-3" /></button>
                  <button aria-label="폴더에 마인드맵 추가" className="rounded p-1 text-muted-foreground hover:text-primary" onClick={() => createNote('mindmap', folder.id)} type="button"><Network className="size-3" /></button>
                  <button aria-label="폴더 이름 변경" className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => renameFolder(folder)} type="button"><Pencil className="size-3" /></button>
                  <button aria-label="폴더 삭제" className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => deleteFolder(folder)} type="button"><Trash2 className="size-3" /></button>
                </div>
                {isOpen && folderNotes.length > 0 && (
                  <ul className="ml-4 mt-1 space-y-1 border-l border-border/60 pl-2">
                    {folderNotes.map(renderNote)}
                  </ul>
                )}
              </div>
            );
          })}

          <div>
            <div className="flex items-center justify-between px-1 py-1 text-[11px] font-medium text-muted-foreground">
              <span>미분류 {unfiled.length}</span>
              <button className="flex items-center gap-1 hover:text-primary" onClick={() => createNote('mindmap', null)} type="button"><Network className="size-3" /> 마인드맵</button>
            </div>
            {unfiled.length > 0 ? (
              <ul className="space-y-1">{unfiled.map(renderNote)}</ul>
            ) : data.folders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] leading-5 text-muted-foreground">
                구상 노트나 마인드맵을 추가해<br />이야기의 큰 흐름을 정리하세요.
              </p>
            ) : null}
          </div>
          {message && <p className="text-[11px] text-destructive">{message}</p>}
        </div>
      )}
    </section>
  );
}
