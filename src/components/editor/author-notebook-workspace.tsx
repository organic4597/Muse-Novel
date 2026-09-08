'use client';

import {
  Check,
  ImagePlus,
  Link2,
  Loader2,
  MousePointer2,
  Network,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import type { AuthorNotebookNote } from '@/components/editor/author-notebook-sidebar';
import type { PlateEditorHandle, PlateEditorProps } from '@/components/editor/plate-editor';
import { extractBoundedPlateText } from '@/lib/editor/bounded-plate-content';
import { Button } from '@/components/ui/button';
import {
  type MindMapContent,
  type MindMapNode,
  getTextNoteEditorJson,
  parseStoredAuthorNoteContent,
  type TextNoteContent,
} from '@/lib/author-notebook';

const BOARD_WIDTH = 1800;
const BOARD_HEIGHT = 1100;
const NODE_COLORS = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e'];

const NoteEditor = dynamic<PlateEditorProps>(
  () => import('@/components/editor/plate-editor').then(module => module.PlateEditor),
  { ssr: false, loading: () => <p className="p-6 text-sm text-muted-foreground">편집기를 불러오는 중...</p> }
);
export type AuthorNotebookWorkspaceHandle = { flushSave: () => Promise<boolean> };

export type AuthorNotebookWorkspaceProps = {
  ref?: Ref<AuthorNotebookWorkspaceHandle>;
  note: AuthorNotebookNote;
  onClose: () => void;
  onNoteUpdated: (note: AuthorNotebookNote) => void;
  projectId: string;
};

function initialContent(note: AuthorNotebookNote) {
  try {
    return parseStoredAuthorNoteContent(note.kind, note.contentJson);
  } catch {
    return note.kind === 'text'
      ? ({ text: '' } satisfies TextNoteContent)
      : ({ edges: [], nodes: [] } satisfies MindMapContent);
  }
}

export function AuthorNotebookWorkspace({
  ref,
  note,
  onClose,
  onNoteUpdated,
  projectId,
}: AuthorNotebookWorkspaceProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState<TextNoteContent | MindMapContent>(() =>
    initialContent(note)
  );
  const [status, setStatus] = useState('저장됨');
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef(content);
  const latestTitleRef = useRef(title);
  const editorRef = useRef<PlateEditorHandle>(null);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  // Only a different document may reset local edits, not a delayed save acknowledgement.
  /* eslint-disable react-hooks/exhaustive-deps */
  const initialEditorContent = useMemo(() => {
    const initial = initialContent(note);
    return 'text' in initial ? getTextNoteEditorJson(initial) : undefined;
  }, [note.id]);

  useEffect(() => {
    const next = initialContent(note);
    setTitle(note.title);
    setContent(next);
    latestContentRef.current = next;
    latestTitleRef.current = note.title;
    revisionRef.current = 0;
    savedRevisionRef.current = 0;
    setStatus('저장됨');
  }, [note.id]);

  /* eslint-enable react-hooks/exhaustive-deps */

  const persist = useCallback(
    (nextContent = latestContentRef.current, nextTitle = latestTitleRef.current) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const revision = revisionRef.current;
      const pending = saveQueue.current.then(async () => {
      setSaving(true);
      setStatus('저장 중...');
      try {
        const response = await fetch(
          `/api/projects/${projectId}/author-notes/${note.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: nextContent, title: nextTitle }),
          }
        );
        const updated = (await response.json()) as AuthorNotebookNote & {
          error?: string;
        };
        if (!response.ok) throw new Error(updated.error ?? '저장하지 못했습니다.');
        savedRevisionRef.current = revision;
        if (revision === revisionRef.current) {
          setStatus('저장됨');
          onNoteUpdated(updated);
        }
        return true;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '저장하지 못했습니다.');
        return false;
      } finally {
        setSaving(false);
      }
      });
      saveQueue.current = pending;
      return pending;
    },
    [note.id, onNoteUpdated, projectId]
  );

  const flushSave = async () => {
    await editorRef.current?.flushProcessing();
    if (revisionRef.current === savedRevisionRef.current) return saveQueue.current;
    return persist();
  };
  useImperativeHandle(ref, () => ({ flushSave }));

  const scheduleSave = (next: TextNoteContent | MindMapContent) => {
    latestContentRef.current = next;
    revisionRef.current += 1;
    setContent(next);
    setStatus('변경됨');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persist(next), 700);
  };

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  return (
    <section className="muse-panel flex min-h-[calc(100vh-12rem)] flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-card/70 px-5 py-4 sm:px-7">
        {note.kind === 'mindmap' ? (
          <Network className="size-5 text-primary" />
        ) : (
          <MousePointer2 className="size-5 text-primary" />
        )}
        <input
          aria-label="작가 노트 제목"
          className="min-w-48 flex-1 bg-transparent font-heading text-xl font-semibold outline-none"
          onBlur={() => void flushSave()}
          onChange={(event) => {
            latestTitleRef.current = event.target.value;
            revisionRef.current += 1;
            setTitle(event.target.value);
            setStatus('변경됨');
          }}
          value={title}
        />
        <span className="text-xs text-muted-foreground" role="status">
          {saving && <Loader2 className="mr-1 inline size-3 animate-spin" />}
          {status}
        </span>
        <Button onClick={() => void flushSave()} size="sm" type="button" variant="outline">
          <Save /> 저장
        </Button>
        <Button aria-label="작가 노트 닫기" onClick={async () => { if (await flushSave()) onClose(); }} size="icon-sm" type="button" variant="ghost">
          <X />
        </Button>
      </header>

      {note.kind === 'text' && 'text' in content ? (
        <div className="min-h-[calc(100vh-18rem)] flex-1" onBlurCapture={() => {
          void flushSave();
        }}>
          <NoteEditor
            ariaLabel="작가 구상 노트"
            content={initialEditorContent}
            documentId={`note:${note.id}`}
            ghostTextEnabled={false}
            projectId={projectId}
            ref={editorRef}
            onValueChange={editorJson => scheduleSave({
              text: extractBoundedPlateText(editorJson, { maxTextChars: 500_000 }), editorJson,
            })}
          />
        </div>
      ) : note.kind === 'mindmap' && 'nodes' in content ? (
        <MindMapBoard
          content={content}
          noteId={note.id}
          onChange={scheduleSave}
          onSave={() => void persist()}
          projectId={projectId}
        />
      ) : null}
    </section>
  );
}

function MindMapBoard({
  content,
  noteId,
  onChange,
  onSave,
  projectId,
}: {
  content: MindMapContent;
  noteId: string;
  onChange: (content: MindMapContent) => void;
  onSave: () => void;
  projectId: string;
}) {
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    id: string;
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
  } | null>(null);

  const changeNode = (id: string, patch: Partial<MindMapNode>) => {
    onChange({
      ...content,
      nodes: content.nodes.map((node) =>
        node.id === id ? { ...node, ...patch } : node
      ),
    });
  };

  const addTextNode = () => {
    const offset = content.nodes.length * 28;
    onChange({
      ...content,
      nodes: [
        ...content.nodes,
        {
          color: NODE_COLORS[content.nodes.length % NODE_COLORS.length],
          height: 140,
          id: crypto.randomUUID(),
          kind: 'text',
          text: '새 아이디어',
          width: 240,
          x: 90 + (offset % 420),
          y: 100 + (offset % 300),
        },
      ],
    });
  };

  const connectNode = (nodeId: string) => {
    if (!connectingFrom) {
      setConnectingFrom(nodeId);
      return;
    }
    if (connectingFrom === nodeId) {
      setConnectingFrom(null);
      return;
    }
    const exists = content.edges.some(
      (edge) =>
        (edge.from === connectingFrom && edge.to === nodeId) ||
        (edge.from === nodeId && edge.to === connectingFrom)
    );
    if (!exists) {
      onChange({
        ...content,
        edges: [
          ...content.edges,
          { from: connectingFrom, id: crypto.randomUUID(), to: nodeId },
        ],
      });
    }
    setConnectingFrom(null);
  };

  const deleteNode = (nodeId: string) => {
    onChange({
      edges: content.edges.filter(
        (edge) => edge.from !== nodeId && edge.to !== nodeId
      ),
      nodes: content.nodes.filter((node) => node.id !== nodeId),
    });
    if (connectingFrom === nodeId) setConnectingFrom(null);
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('image', file);
      const response = await fetch(
        `/api/projects/${projectId}/author-notes/${noteId}/images`,
        { body: form, method: 'POST' }
      );
      const image = (await response.json()) as {
        error?: string;
        height?: number;
        imagePath?: string;
        width?: number;
      };
      if (!response.ok || !image.imagePath) {
        throw new Error(image.error ?? '이미지를 추가하지 못했습니다.');
      }
      const width = 300;
      const height = Math.min(
        360,
        Math.max(140, width * ((image.height ?? 1) / (image.width ?? 1)))
      );
      onChange({
        ...content,
        nodes: [
          ...content.nodes,
          {
            color: '#0f172a',
            height,
            id: crypto.randomUUID(),
            imagePath: image.imagePath,
            kind: 'image',
            text: file.name.replace(/\.[^.]+$/u, ''),
            width,
            x: 120 + (content.nodes.length * 34) % 480,
            y: 120 + (content.nodes.length * 34) % 320,
          },
        ],
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const nodeById = new Map(content.nodes.map((node) => [node.id, node]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-3">
        <Button onClick={addTextNode} size="sm" type="button" variant="secondary">
          <Plus /> 아이디어 카드
        </Button>
        <Button disabled={uploading} onClick={() => fileInputRef.current?.click()} size="sm" type="button" variant="outline">
          {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          이미지
        </Button>
        <input
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadImage(file);
          }}
          ref={fileInputRef}
          type="file"
        />
        {connectingFrom && (
          <span className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary">
            <Link2 className="size-3" /> 연결할 카드를 선택하세요
            <button onClick={() => setConnectingFrom(null)} type="button"><X className="size-3" /></button>
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          카드 {content.nodes.length} · 연결 {content.edges.length}
        </span>
        <Button onClick={onSave} size="sm" type="button" variant="ghost"><Check /> 지금 저장</Button>
      </div>

      <div
        className="min-h-[65vh] flex-1 overflow-auto bg-[radial-gradient(circle_at_1px_1px,color-mix(in_oklab,var(--border)_65%,transparent)_1px,transparent_0)] bg-[size:24px_24px]"
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          changeNode(drag.id, {
            x: Math.max(0, Math.min(BOARD_WIDTH - 160, drag.x + event.clientX - drag.pointerX)),
            y: Math.max(0, Math.min(BOARD_HEIGHT - 100, drag.y + event.clientY - drag.pointerY)),
          });
        }}
        onPointerUp={() => {
          if (dragRef.current) {
            dragRef.current = null;
            onSave();
          }
        }}
      >
        <div className="relative" style={{ height: BOARD_HEIGHT, width: BOARD_WIDTH }}>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
            {content.edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              return (
                <line
                  key={edge.id}
                  stroke="currentColor"
                  strokeOpacity="0.32"
                  strokeWidth="2"
                  x1={from.x + from.width / 2}
                  x2={to.x + to.width / 2}
                  y1={from.y + from.height / 2}
                  y2={to.y + to.height / 2}
                />
              );
            })}
          </svg>

          {content.nodes.map((node) => (
            <article
              className="absolute overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
              key={node.id}
              style={{
                height: node.height,
                left: node.x,
                top: node.y,
                width: node.width,
              }}
            >
              <div
                className="flex cursor-grab items-center gap-1 border-b border-border/60 px-2 py-1.5 active:cursor-grabbing"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = {
                    id: node.id,
                    pointerX: event.clientX,
                    pointerY: event.clientY,
                    x: node.x,
                    y: node.y,
                  };
                }}
                style={{ borderTop: `4px solid ${node.color}` }}
              >
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{node.kind === 'image' ? '이미지' : '아이디어'}</span>
                <button aria-label="카드 연결" className={connectingFrom === node.id ? 'text-primary' : 'text-muted-foreground'} onClick={() => connectNode(node.id)} type="button"><Link2 className="size-3.5" /></button>
                <button aria-label="카드 삭제" className="text-muted-foreground hover:text-destructive" onClick={() => deleteNode(node.id)} type="button"><Trash2 className="size-3.5" /></button>
              </div>
              {node.kind === 'image' && node.imagePath ? (
                <div className="flex h-[calc(100%-2rem)] flex-col">
                  <img alt={node.text || '작가 노트 이미지'} className="min-h-0 flex-1 object-contain" src={node.imagePath} />
                  <input
                    aria-label="이미지 설명"
                    className="border-t border-border/50 bg-transparent px-2 py-1 text-xs outline-none"
                    onChange={(event) => changeNode(node.id, { text: event.target.value })}
                    value={node.text}
                  />
                </div>
              ) : (
                <textarea
                  aria-label="마인드맵 카드 내용"
                  className="h-[calc(100%-2rem)] w-full resize-none bg-transparent p-3 text-sm leading-6 outline-none"
                  onBlur={onSave}
                  onChange={(event) => changeNode(node.id, { text: event.target.value })}
                  value={node.text}
                />
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
