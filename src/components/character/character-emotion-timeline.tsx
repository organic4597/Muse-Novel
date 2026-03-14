'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

type Emotion = {
  id: string;
  characterId: string;
  chapterId: string;
  emotion: string;
  note: string | null;
  createdAt: Date | null;
  chapterTitle: string;
  chapterOrder: number;
};

type Chapter = {
  id: string;
  title: string;
  order: number;
};

type Props = {
  projectId: string;
  characterId: string;
};

export function CharacterEmotionTimeline({ projectId, characterId }: Props) {
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New emotion form state
  const [newChapterId, setNewChapterId] = useState('');
  const [newEmotion, setNewEmotion] = useState('');
  const [newNote, setNewNote] = useState('');

  // Edit state
  const [editEmotion, setEditEmotion] = useState('');
  const [editNote, setEditNote] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmotions = async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/emotions`
      );
      if (res.ok) {
        const data = await res.json();
        setEmotions(data.emotions ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChapters = async () => {
    const res = await fetch(`/api/projects/${projectId}/chapters`);
    if (res.ok) {
      const data = await res.json();
      setChapters(data ?? []);
    }
  };

  useEffect(() => {
    void fetchEmotions();
    void fetchChapters();
  }, [projectId, characterId]);

  const handleAdd = async () => {
    if (!newChapterId || !newEmotion.trim()) {
      setError('챕터와 감정은 필수입니다.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/emotions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chapterId: newChapterId,
            emotion: newEmotion.trim(),
            note: newNote.trim() || undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? '저장에 실패했습니다.');
        return;
      }
      setIsAdding(false);
      setNewChapterId('');
      setNewEmotion('');
      setNewNote('');
      await fetchEmotions();
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async (id: string) => {
    if (!editEmotion.trim()) {
      setError('감정은 필수입니다.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/emotions/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emotion: editEmotion.trim(),
            note: editNote.trim() || undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? '수정에 실패했습니다.');
        return;
      }
      setEditingId(null);
      await fetchEmotions();
    } catch {
      setError('수정에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 감정 항목을 삭제하시겠습니까?')) return;
    try {
      await fetch(
        `/api/projects/${projectId}/characters/${characterId}/emotions/${id}`,
        { method: 'DELETE' }
      );
      await fetchEmotions();
    } catch {
      setError('삭제에 실패했습니다.');
    }
  };

  const startEdit = (emotion: Emotion) => {
    setEditingId(emotion.id);
    setEditEmotion(emotion.emotion);
    setEditNote(emotion.note ?? '');
    setError(null);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">감정 타임라인</h3>
        {!isAdding && (
          <Button
            onClick={() => {
              setIsAdding(true);
              setError(null);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            감정 추가
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="mb-4 space-y-3 rounded-lg border border-border p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              챕터
            </label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              onChange={(e) => setNewChapterId(e.target.value)}
              value={newChapterId}
            >
              <option value="">챕터 선택</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.order + 1}장. {ch.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              감정
            </label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              onChange={(e) => setNewEmotion(e.target.value)}
              placeholder="예: 기쁨, 슬픔, 분노..."
              type="text"
              value={newEmotion}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              메모 (선택)
            </label>
            <textarea
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="감정에 대한 메모..."
              rows={2}
              value={newNote}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              disabled={isSaving}
              onClick={handleAdd}
              size="sm"
              type="button"
            >
              {isSaving ? '저장 중...' : '저장'}
            </Button>
            <Button
              onClick={() => {
                setIsAdding(false);
                setError(null);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              취소
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : emotions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 감정 항목이 없습니다
        </p>
      ) : (
        <ul className="space-y-3">
          {emotions.map((emotion) => (
            <li
              className="relative rounded-lg border border-border p-3"
              key={emotion.id}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs text-muted-foreground">
                    {emotion.chapterOrder + 1}장. {emotion.chapterTitle}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => startEdit(emotion)}
                    type="button"
                  >
                    수정
                  </button>
                  <span className="text-muted-foreground/40">|</span>
                  <button
                    className="text-xs text-destructive hover:text-destructive/80"
                    onClick={() => void handleDelete(emotion.id)}
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              </div>

              {editingId === emotion.id ? (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      감정
                    </label>
                    <input
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      onChange={(e) => setEditEmotion(e.target.value)}
                      type="text"
                      value={editEmotion}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      메모
                    </label>
                    <textarea
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      onChange={(e) => setEditNote(e.target.value)}
                      rows={2}
                      value={editNote}
                    />
                  </div>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  <div className="flex gap-2">
                    <Button
                      disabled={isSaving}
                      onClick={() => void handleEdit(emotion.id)}
                      size="sm"
                      type="button"
                    >
                      {isSaving ? '저장 중...' : '저장'}
                    </Button>
                    <Button
                      onClick={() => {
                        setEditingId(null);
                        setError(null);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      취소
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium">{emotion.emotion}</p>
                  {emotion.note && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {emotion.note}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
