'use client';

import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { WritingStyleProfile } from '@/lib/db/queries/writing-style-profiles';

const inputClass =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30';

const textareaClass = `${inputClass} resize-y`;

const selectClass =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30';

type Props = {
  initialProfiles: WritingStyleProfile[];
};

export function GlobalStyleProfilesSection({ initialProfiles }: Props) {
  const [profiles, setProfiles] = useState<WritingStyleProfile[]>(initialProfiles);
  const [selectedId, setSelectedId] = useState<string>(initialProfiles[0]?.id ?? '');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = profiles.find((p) => p.id === selectedId);
  const [editDescription, setEditDescription] = useState(selected?.description ?? '');

  const handleSelectChange = (id: string) => {
    setSelectedId(id);
    const p = profiles.find((pr) => pr.id === id);
    setEditDescription(p?.description ?? '');
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('프로파일 이름을 입력하세요');
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch('/api/style-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const profile = (await res.json()) as WritingStyleProfile;
        setProfiles((prev) => [...prev, profile]);
        setSelectedId(profile.id);
        setEditDescription('');
        setNewName('');
        toast.success('프로파일이 생성되었습니다');
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? '생성에 실패했습니다');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다');
    } finally {
      setIsCreating(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    e.target.value = '';

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/style-profiles/${selectedId}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const updated = (await res.json()) as WritingStyleProfile;
        setProfiles((prev) => prev.map((p) => (p.id === selectedId ? updated : p)));
        toast.success('파일이 업로드되었습니다');
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? '업로드에 실패했습니다');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedId) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/style-profiles/${selectedId}/analyze`, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { description: string; profile: WritingStyleProfile };
        setEditDescription(data.description);
        setProfiles((prev) => prev.map((p) => (p.id === selectedId ? data.profile : p)));
        toast.success('문체 분석이 완료되었습니다');
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? '분석에 실패했습니다');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!selectedId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/style-profiles/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editDescription || null }),
      });
      if (res.ok) {
        const updated = (await res.json()) as WritingStyleProfile;
        setProfiles((prev) => prev.map((p) => (p.id === selectedId ? updated : p)));
        toast.success('저장되었습니다');
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? '저장에 실패했습니다');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/style-profiles/${selectedId}`, { method: 'DELETE' });
      if (res.ok) {
        const remaining = profiles.filter((p) => p.id !== selectedId);
        setProfiles(remaining);
        const next = remaining[0]?.id ?? '';
        setSelectedId(next);
        setEditDescription(remaining.find((p) => p.id === next)?.description ?? '');
        toast.success('프로파일이 삭제되었습니다');
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? '삭제에 실패했습니다');
      }
    } catch {
      toast.error('네트워크 오류가 발생했습니다');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted">
          <Sparkles className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">문체 프로파일 관리</h2>
          <p className="text-sm text-muted-foreground">
            모든 소설에서 공유되는 문체 프로파일을 관리합니다. 각 소설 설정에서 원하는 프로파일을 선택해 적용하세요.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-6 space-y-5">
        <div className="space-y-2">
          <div className="flex gap-2">
            {profiles.length > 0 ? (
              <select
                className={selectClass}
                onChange={(e) => handleSelectChange(e.target.value)}
                value={selectedId}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                아직 프로파일이 없습니다. 새 프로파일을 만들어 보세요.
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <input
              className={inputClass}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
              placeholder="새 프로파일 이름..."
              value={newName}
            />
            <Button
              disabled={isCreating || !newName.trim()}
              onClick={handleCreate}
              type="button"
              variant="outline"
            >
              {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              추가
            </Button>
          </div>
        </div>

        {selected && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">소설 텍스트 파일</label>
              <div className="flex items-center gap-3">
                {selected.filePath ? (
                  <p className="text-sm text-muted-foreground flex-1 truncate">✓ 파일 업로드됨</p>
                ) : (
                  <p className="text-sm text-muted-foreground flex-1">.txt 파일을 업로드하세요 (최대 10MB)</p>
                )}
                <Button
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isUploading ? (
                    <><Loader2 className="size-4 animate-spin" />업로드 중...</>
                  ) : (
                    selected.filePath ? '파일 교체' : '파일 선택'
                  )}
                </Button>
              </div>
              <input accept=".txt" className="hidden" onChange={handleFileChange} ref={fileInputRef} type="file" />
            </div>

            <Button disabled={isAnalyzing || !selected.filePath} onClick={handleAnalyze} type="button" variant="outline">
              {isAnalyzing ? (
                <><Loader2 className="size-4 animate-spin" />분석 중...</>
              ) : (
                <><Sparkles className="size-4" />AI로 문체 분석</>
              )}
            </Button>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="g-style-description">
                문체 설명 <span className="font-normal text-muted-foreground">(직접 편집 가능)</span>
              </label>
              <textarea
                className={`${textareaClass} min-h-24`}
                id="g-style-description"
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="예: 단문 위주의 간결한 문체, 3인칭 관찰자 시점, 감정 묘사보다 행동 묘사 중심..."
                value={editDescription}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button disabled={isDeleting} onClick={handleDelete} size="sm" type="button" variant="outline">
                {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                삭제
              </Button>
              <Button disabled={isSaving} onClick={handleSaveDescription} type="button">
                {isSaving ? <><Loader2 className="size-4 animate-spin" />저장 중...</> : '저장'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
