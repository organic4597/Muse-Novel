'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CharacterAppearances } from '@/components/character/character-appearances';
import { CharacterEmotionTimeline } from '@/components/character/character-emotion-timeline';
import { CharacterForm } from '@/components/character/character-form';
import { CharacterGallery } from '@/components/character/character-gallery';
import { CharacterImageUpload } from '@/components/character/character-image-upload';
import { CharacterRelationships } from '@/components/character/character-relationships';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { CharacterItem } from '@/lib/ai/story-planning-types';

type Character = {
  id: string;
  projectId: string;
  name: string;
  role: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  arcDescription: string | null;
  itemsJson: string | null;
  imagePath: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const ROLE_COLORS: Record<string, string> = {
  '주인공': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  '조연': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  '악역': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  '조력자': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  '기타': 'bg-secondary text-secondary-foreground',
};

export function CharacterList({
  projectId,
  characters,
}: {
  projectId: string;
  characters: Character[];
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
    null
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">캐릭터</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            소설 속 캐릭터를 관리하세요
          </p>
        </div>
        <Dialog onOpenChange={setIsCreateOpen} open={isCreateOpen}>
          <DialogTrigger asChild>
            <Button>새 캐릭터</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>새 캐릭터</DialogTitle>
              <DialogDescription>
                새로운 캐릭터를 만들어보세요
              </DialogDescription>
            </DialogHeader>
            <CharacterForm
              onSuccess={() => setIsCreateOpen(false)}
              projectId={projectId}
            />
          </DialogContent>
        </Dialog>
      </div>

      {characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <p className="text-lg font-medium text-muted-foreground">
            아직 캐릭터가 없습니다
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            &quot;새 캐릭터&quot; 버튼을 눌러 첫 캐릭터를 만드세요
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((character) => (
            <button
              className="group rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-foreground/20 hover:bg-accent/50"
              key={character.id}
              onClick={() => setSelectedCharacter(character)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                {character.imagePath ? (
                  <img
                    alt={character.name}
                    className="size-10 rounded-full object-cover"
                    src={character.imagePath}
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {character.name.charAt(0)}
                  </div>
                )}
                {character.role && (
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[character.role] ?? ROLE_COLORS['기타']}`}
                  >
                    {character.role}
                  </span>
                )}
              </div>
              <h2 className="mt-3 font-semibold text-card-foreground group-hover:text-foreground">
                {character.name}
              </h2>
              {(character.personality || character.backstory) && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {character.personality || character.backstory}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {selectedCharacter && (
        <CharacterDetailDialog
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          projectId={projectId}
        />
      )}
    </div>
  );
}

function CharacterDetailDialog({
  projectId,
  character,
  onClose,
}: {
  projectId: string;
  character: Character;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [currentCharacter, setCurrentCharacter] = useState<Character>(character);

  const refreshCharacter = async () => {
    const res = await fetch(
      `/api/projects/${projectId}/characters/${character.id}`
    );
    if (res.ok) {
      const data = (await res.json()) as Character;
      setCurrentCharacter(data);
      router.refresh();
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {isEditing ? (
          <>
            <DialogHeader>
              <DialogTitle>캐릭터 수정</DialogTitle>
              <DialogDescription>
                캐릭터 정보를 수정하세요
              </DialogDescription>
            </DialogHeader>
            <CharacterForm
              character={currentCharacter}
              onSuccess={() => {
                setIsEditing(false);
                onClose();
              }}
              projectId={projectId}
            />
            <div className="flex justify-start">
              <Button
                onClick={() => setIsEditing(false)}
                type="button"
                variant="outline"
              >
                취소
              </Button>
            </div>
          </>
        ) : (
          <CharacterDetailView
            character={currentCharacter}
            onClose={onClose}
            onEdit={() => setIsEditing(true)}
            onImageChange={refreshCharacter}
            projectId={projectId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CharacterDetailView({
  projectId,
  character,
  onEdit,
  onClose,
  onImageChange,
}: {
  projectId: string;
  character: Character;
  onEdit: () => void;
  onClose: () => void;
  onImageChange: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', description: '', status: '보유' });
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm('정말로 이 캐릭터를 삭제하시겠습니까?')) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${character.id}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        router.refresh();
        onClose();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const fields = [
    { label: '역할', value: character.role },
    { label: '외모', value: character.appearance },
    { label: '성격', value: character.personality },
    { label: '배경', value: character.backstory },
    { label: '캐릭터 아크', value: character.arcDescription },
  ];

  const items: CharacterItem[] = (() => {
    try {
      return JSON.parse(character.itemsJson ?? '[]');
    } catch {
      return [];
    }
  })();

  const STATUS_COLORS: Record<string, string> = {
    '보유': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    '장착중': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    '분실': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    '기타': 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400',
  };

  const saveItems = async (updatedItems: CharacterItem[]) => {
    const res = await fetch(
      `/api/projects/${projectId}/characters/${character.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemsJson: JSON.stringify(updatedItems) }),
      }
    );
    if (res.ok) {
      onImageChange();
    }
  };

  const handleAddItem = async () => {
    if (!itemForm.name.trim()) return;
    const newItem: CharacterItem = {
      name: itemForm.name.trim(),
      ...(itemForm.description.trim() && { description: itemForm.description.trim() }),
      ...(itemForm.status && { status: itemForm.status }),
    };
    await saveItems([...items, newItem]);
    setItemForm({ name: '', description: '', status: '보유' });
    setIsAddingItem(false);
  };

  const handleEditItem = async (index: number) => {
    if (!itemForm.name.trim()) return;
    const updated = items.map((item, i) =>
      i === index
        ? {
            name: itemForm.name.trim(),
            ...(itemForm.description.trim() && { description: itemForm.description.trim() }),
            ...(itemForm.status && { status: itemForm.status }),
          }
        : item
    );
    await saveItems(updated);
    setEditingItemIndex(null);
    setItemForm({ name: '', description: '', status: '보유' });
  };

  const handleDeleteItem = async (index: number) => {
    await saveItems(items.filter((_, i) => i !== index));
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          {character.imagePath ? (
            <img
              alt={character.name}
              className="size-12 rounded-full object-cover"
              src={character.imagePath}
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
              {character.name.charAt(0)}
            </div>
          )}
          <div>
            <DialogTitle>{character.name}</DialogTitle>
            {character.role && (
              <span
                className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[character.role] ?? ROLE_COLORS['기타']}`}
              >
                {character.role}
              </span>
            )}
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4">
        {fields.map(
          (field) =>
            field.value && (
              <div key={field.label}>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {field.label}
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {field.value}
                </p>
              </div>
            )
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">🎒 소지품</h3>
          {!isAddingItem && (
            <button
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                setItemForm({ name: '', description: '', status: '보유' });
                setIsAddingItem(true);
                setEditingItemIndex(null);
              }}
              type="button"
            >
              추가
            </button>
          )}
        </div>

        {items.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border">
            {items.map((item, index) =>
              editingItemIndex === index ? (
                <div className="space-y-2 p-3" key={index}>
                  <input
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                    onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="아이템 이름"
                    value={itemForm.name}
                  />
                  <textarea
                    className="w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                    onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="설명 (선택)"
                    rows={2}
                    value={itemForm.description}
                  />
                  <select
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                    onChange={(e) => setItemForm((f) => ({ ...f, status: e.target.value }))}
                    value={itemForm.status}
                  >
                    <option value="보유">보유</option>
                    <option value="장착중">장착중</option>
                    <option value="분실">분실</option>
                    <option value="기타">기타</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      onClick={() => handleEditItem(index)}
                      type="button"
                    >
                      저장
                    </button>
                    <button
                      className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingItemIndex(null);
                        setItemForm({ name: '', description: '', status: '보유' });
                      }}
                      type="button"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2 p-3" key={index}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{item.name}</span>
                      {item.status && (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${STATUS_COLORS[item.status] ?? STATUS_COLORS['기타']}`}
                        >
                          {item.status}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setItemForm({
                          name: item.name,
                          description: item.description ?? '',
                          status: item.status ?? '보유',
                        });
                        setEditingItemIndex(index);
                        setIsAddingItem(false);
                      }}
                      type="button"
                    >
                      수정
                    </button>
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteItem(index)}
                      type="button"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {isAddingItem && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="아이템 이름"
              value={itemForm.name}
            />
            <textarea
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="설명 (선택)"
              rows={2}
              value={itemForm.description}
            />
            <select
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              onChange={(e) => setItemForm((f) => ({ ...f, status: e.target.value }))}
              value={itemForm.status}
            >
              <option value="보유">보유</option>
              <option value="장착중">장착중</option>
              <option value="분실">분실</option>
              <option value="기타">기타</option>
            </select>
            <div className="flex gap-2">
              <button
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                onClick={handleAddItem}
                type="button"
              >
                추가
              </button>
              <button
                className="rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setIsAddingItem(false);
                  setItemForm({ name: '', description: '', status: '보유' });
                }}
                type="button"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {items.length === 0 && !isAddingItem && (
          <p className="text-xs text-muted-foreground">등록된 소지품이 없습니다</p>
        )}
      </div>

      <CharacterImageUpload
        characterId={character.id}
        characterName={character.name}
        currentImagePath={character.imagePath}
        onImageChange={() => {
          onImageChange();
          setGalleryRefreshKey((k) => k + 1);
        }}
        projectId={projectId}
      />

      <CharacterGallery
        characterId={character.id}
        onPrimaryChanged={onImageChange}
        projectId={projectId}
        refreshKey={galleryRefreshKey}
      />

      <CharacterAppearances
        characterId={character.id}
        projectId={projectId}
      />

      <CharacterEmotionTimeline
        characterId={character.id}
        projectId={projectId}
      />

      <CharacterRelationships
        characterId={character.id}
        projectId={projectId}
      />

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button onClick={onEdit} type="button" variant="outline">
          수정
        </Button>
        <Button
          disabled={isDeleting}
          onClick={handleDelete}
          type="button"
          variant="destructive"
        >
          {isDeleting ? '삭제 중...' : '삭제'}
        </Button>
      </div>
    </>
  );
}
