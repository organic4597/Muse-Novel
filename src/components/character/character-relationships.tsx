'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Relationship = {
  id: string;
  characterAId: string;
  characterBId: string;
  relationshipType: string;
  description: string | null;
  createdAt: Date | null;
  otherCharacterName: string;
  otherCharacterId: string;
};

type OtherCharacter = {
  id: string;
  name: string;
};

export function CharacterRelationships({
  projectId,
  characterId,
}: {
  projectId: string;
  characterId: string;
}) {
  const router = useRouter();
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [otherCharacters, setOtherCharacters] = useState<OtherCharacter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [relationshipType, setRelationshipType] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchRelationships = async () => {
    const res = await fetch(
      `/api/projects/${projectId}/characters/${characterId}/relationships`
    );
    if (res.ok) {
      const data = await res.json();
      setRelationships(data);
    }
    setIsLoading(false);
  };

  const fetchCharacters = async () => {
    const res = await fetch(`/api/projects/${projectId}/characters`);
    if (res.ok) {
      const data: OtherCharacter[] = await res.json();
      setOtherCharacters(data.filter((c) => c.id !== characterId));
    }
  };

  useEffect(() => {
    fetchRelationships();
    fetchCharacters();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial fetch only
  }, [projectId, characterId]);

  const resetForm = () => {
    setSelectedCharacterId('');
    setRelationshipType('');
    setDescription('');
    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!relationshipType.trim() || !selectedCharacterId) return;

    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/relationships`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterBId: selectedCharacterId,
            relationshipType: relationshipType.trim(),
            description: description.trim() || null,
          }),
        }
      );

      if (res.ok) {
        resetForm();
        await fetchRelationships();
        router.refresh();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !relationshipType.trim()) return;

    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/relationships/${editingId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            relationshipType: relationshipType.trim(),
            description: description.trim() || null,
          }),
        }
      );

      if (res.ok) {
        resetForm();
        await fetchRelationships();
        router.refresh();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (relId: string) => {
    if (!confirm('이 관계를 삭제하시겠습니까?')) return;

    const res = await fetch(
      `/api/projects/${projectId}/characters/${characterId}/relationships/${relId}`,
      { method: 'DELETE' }
    );

    if (res.ok) {
      await fetchRelationships();
      router.refresh();
    }
  };

  const startEdit = (rel: Relationship) => {
    setEditingId(rel.id);
    setRelationshipType(rel.relationshipType);
    setDescription(rel.description ?? '');
    setSelectedCharacterId(rel.otherCharacterId);
    setIsFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        관계 불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">관계</h3>
        {!isFormOpen && (
          <Button
            onClick={() => {
              resetForm();
              setIsFormOpen(true);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            관계 추가
          </Button>
        )}
      </div>

      {/* Relationship list */}
      {relationships.length === 0 && !isFormOpen && (
        <p className="text-sm text-muted-foreground">
          등록된 관계가 없습니다.
        </p>
      )}

      {relationships.map((rel) =>
        editingId === rel.id && isFormOpen ? null : (
          <div
            className="flex items-start justify-between gap-2 rounded-md border border-border p-3"
            key={rel.id}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {rel.otherCharacterName}
                </span>
                <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {rel.relationshipType}
                </span>
              </div>
              {rel.description && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {rel.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                onClick={() => startEdit(rel)}
                size="sm"
                type="button"
                variant="ghost"
              >
                수정
              </Button>
              <Button
                onClick={() => handleDelete(rel.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                삭제
              </Button>
            </div>
          </div>
        )
      )}

      {/* Create/Edit form */}
      {isFormOpen && (
        <form
          className="space-y-3 rounded-md border border-border p-3"
          onSubmit={editingId ? handleUpdate : handleCreate}
        >
          {!editingId && (
            <div className="space-y-1">
              <label
                className="text-xs font-medium"
                htmlFor="rel-target-character"
              >
                대상 캐릭터
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                disabled={isSaving}
                id="rel-target-character"
                onChange={(e) => setSelectedCharacterId(e.target.value)}
                required
                value={selectedCharacterId}
              >
                <option value="">캐릭터를 선택하세요</option>
                {otherCharacters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label
              className="text-xs font-medium"
              htmlFor="rel-type"
            >
              관계 유형
            </label>
            <Input
              disabled={isSaving}
              id="rel-type"
              onChange={(e) => setRelationshipType(e.target.value)}
              placeholder="예: 연인, 라이벌, 가족, 동료, 스승-제자"
              required
              value={relationshipType}
            />
          </div>

          <div className="space-y-1">
            <label
              className="text-xs font-medium"
              htmlFor="rel-description"
            >
              설명
            </label>
            <textarea
              className="min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              disabled={isSaving}
              id="rel-description"
              onChange={(e) => setDescription(e.target.value)}
              placeholder="관계에 대한 설명 (선택사항)"
              value={description}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              disabled={isSaving}
              onClick={resetForm}
              size="sm"
              type="button"
              variant="outline"
            >
              취소
            </Button>
            <Button
              disabled={
                isSaving ||
                !relationshipType.trim() ||
                (!editingId && !selectedCharacterId)
              }
              size="sm"
              type="submit"
            >
              {isSaving ? '저장 중...' : editingId ? '수정' : '추가'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
