'use client';

import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Search,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { EntityRevisionPanel } from '@/components/ai/entity-revision-panel';
import { CharacterForm } from '@/components/character/character-form';
import { CharacterImageUpload } from '@/components/character/character-image-upload';
import { AdaptiveDetailDialogContent } from '@/components/ui/adaptive-detail-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_PROGRESSIVE_PAGE_SIZE,
  nextProgressiveCount,
  ProgressiveListControls,
} from '@/components/ui/progressive-list-controls';
import type { CharacterItem } from '@/lib/ai/story-planning-types';

const deferredPanelLoading = () => (
  <p className="py-5 text-center text-xs text-muted-foreground">불러오는 중...</p>
);
const CharacterAppearances = dynamic(
  () => import('@/components/character/character-appearances').then((module) => module.CharacterAppearances),
  { loading: deferredPanelLoading }
);
const CharacterEmotionTimeline = dynamic(
  () => import('@/components/character/character-emotion-timeline').then((module) => module.CharacterEmotionTimeline),
  { loading: deferredPanelLoading }
);
const CharacterGallery = dynamic(
  () => import('@/components/character/character-gallery').then((module) => module.CharacterGallery),
  { loading: deferredPanelLoading }
);
const CharacterRelationships = dynamic(
  () => import('@/components/character/character-relationships').then((module) => module.CharacterRelationships),
  { loading: deferredPanelLoading }
);

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
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

function DeferredCharacterSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-xl border border-border/70">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        </span>
        {isOpen ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="border-t border-border/60 p-3">{children}</div>}
    </section>
  );
}

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
  const [visibleCharacters, setVisibleCharacters] = useState(characters);
  const [characterQuery, setCharacterQuery] = useState('');
  const [visibleCharacterCount, setVisibleCharacterCount] = useState(
    DEFAULT_PROGRESSIVE_PAGE_SIZE
  );
  const deferredCharacterQuery = useDeferredValue(characterQuery);
  const filteredCharacters = useMemo(() => {
    const query = deferredCharacterQuery
      .trim()
      .normalize('NFKC')
      .toLocaleLowerCase('ko-KR');
    if (!query) return visibleCharacters;

    return visibleCharacters.filter((character) =>
      [
        character.name,
        character.role,
        character.personality,
        character.backstory,
        character.arcDescription,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) =>
          value.normalize('NFKC').toLocaleLowerCase('ko-KR').includes(query)
        )
    );
  }, [deferredCharacterQuery, visibleCharacters]);
  const renderedCharacters = filteredCharacters.slice(
    0,
    visibleCharacterCount
  );

  useEffect(() => {
    setVisibleCharacters(characters);
  }, [characters]);

  useEffect(() => {
    setVisibleCharacterCount(DEFAULT_PROGRESSIVE_PAGE_SIZE);
  }, [deferredCharacterQuery]);

  return (
    <div className="space-y-7">
      <section className="muse-panel flex flex-col justify-between gap-5 px-6 py-7 sm:flex-row sm:items-end sm:px-8">
        <div>
          <p className="muse-eyebrow flex items-center gap-1.5">
            <UsersRound className="size-3.5" />
            Character bible
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.03em]">캐릭터</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            인물의 욕망과 관계, 변화를 한곳에서 설계하세요.
          </p>
        </div>
        <Dialog onOpenChange={setIsCreateOpen} open={isCreateOpen}>
          <DialogTrigger asChild>
            <Button size="lg"><UserPlus />새 캐릭터</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>새 캐릭터</DialogTitle>
              <DialogDescription>
                새로운 캐릭터를 만들어보세요
              </DialogDescription>
            </DialogHeader>
            <CharacterForm
              onSuccess={(character) => {
                setVisibleCharacters((current) => [character, ...current]);
                setIsCreateOpen(false);
              }}
              projectId={projectId}
            />
          </DialogContent>
        </Dialog>
      </section>

      {visibleCharacters.length > 0 && (
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="캐릭터 검색"
            className="pl-10"
            onChange={(event) => setCharacterQuery(event.target.value)}
            placeholder="이름, 역할, 성격 또는 배경 검색"
            type="search"
            value={characterQuery}
          />
        </div>
      )}

      {visibleCharacters.length === 0 ? (
        <div className="muse-empty">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-border bg-card text-primary shadow-sm">
            <UsersRound className="size-6" strokeWidth={1.6} />
          </span>
          <p className="mt-5 font-heading text-xl font-semibold">
            아직 캐릭터가 없습니다
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            이야기를 움직일 첫 인물을 만들어 보세요.
          </p>
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="muse-empty">
          <Search className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-4 font-heading text-lg font-semibold">
            일치하는 캐릭터가 없습니다
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            다른 이름, 역할 또는 성격으로 검색해 보세요.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {renderedCharacters.map((character) => (
            <button
              className="muse-card muse-render-lazy group relative min-h-56 overflow-hidden p-5 text-left"
              key={character.id}
              onClick={() => setSelectedCharacter(character)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                {character.imagePath ? (
                  <img
                    alt={character.name}
                    className="size-12 rounded-2xl object-cover ring-1 ring-border"
                    src={character.imagePath}
                  />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 font-heading text-lg font-semibold text-primary">
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
              <h2 className="mt-6 font-heading text-xl font-semibold tracking-[-0.02em] text-card-foreground">
                {character.name}
              </h2>
              {(character.personality || character.backstory) && (
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {character.personality || character.backstory}
                </p>
              )}
              <ArrowUpRight className="absolute right-5 bottom-5 size-4 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          ))}
          </div>
          <ProgressiveListControls
            onLoadMore={() =>
              setVisibleCharacterCount((current) =>
                nextProgressiveCount(current, filteredCharacters.length)
              )
            }
            shown={renderedCharacters.length}
            total={filteredCharacters.length}
          />
        </>
      )}

      {selectedCharacter && (
        <CharacterDetailDialog
          character={selectedCharacter}
          onCharacterChange={(character) => {
            setVisibleCharacters((current) =>
              current.map((item) => item.id === character.id ? character : item)
            );
          }}
          onClose={() => setSelectedCharacter(null)}
          onDeleted={(characterId) => {
            setVisibleCharacters((current) =>
              current.filter((character) => character.id !== characterId)
            );
            setSelectedCharacter(null);
          }}
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
  onCharacterChange,
  onDeleted,
}: {
  projectId: string;
  character: Character;
  onClose: () => void;
  onCharacterChange: (character: Character) => void;
  onDeleted: (characterId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentCharacter, setCurrentCharacter] = useState<Character>(character);

  const refreshCharacter = async () => {
    const res = await fetch(
      `/api/projects/${projectId}/characters/${character.id}`
    );
    if (res.ok) {
      const data = (await res.json()) as Character;
      setCurrentCharacter(data);
      onCharacterChange(data);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <AdaptiveDetailDialogContent
        editing={isEditing}
        sizingContent={[currentCharacter.name, currentCharacter.role, currentCharacter.appearance,
          currentCharacter.personality, currentCharacter.backstory, currentCharacter.arcDescription, currentCharacter.itemsJson]}
      >
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
              onSuccess={(updatedCharacter) => {
                setCurrentCharacter(updatedCharacter);
                onCharacterChange(updatedCharacter);
                setIsEditing(false);
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
            onDeleted={onDeleted}
            onEdit={() => setIsEditing(true)}
            onImageChange={refreshCharacter}
            onSaved={(updated) => { setCurrentCharacter(updated); onCharacterChange(updated); }}
            projectId={projectId}
          />
        )}
      </AdaptiveDetailDialogContent>
    </Dialog>
  );
}

function CharacterDetailView({
  projectId,
  character,
  onEdit,
  onClose,
  onDeleted,
  onImageChange,
  onSaved,
}: {
  projectId: string;
  character: Character;
  onEdit: () => void;
  onClose: () => void;
  onDeleted: (characterId: string) => void;
  onImageChange: () => void;
  onSaved: (character: Character) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', description: '', status: '보유' });

  const handleDelete = async () => {
    if (!confirm('정말로 이 캐릭터를 삭제하시겠습니까?')) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${character.id}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        onDeleted(character.id);
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

      <EntityRevisionPanel entityId={character.id} key={character.id} kind="character" onSaved={(entry) => onSaved(entry as Character)} projectId={projectId} />

      <div className="space-y-4">
        {fields.map(
          (field) =>
            field.value && (
              <div key={field.label}>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {field.label}
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 sm:text-base">
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

      <div className="space-y-2">
        <DeferredCharacterSection
          description="생성·업로드한 이미지 확인"
          title="이미지 갤러리"
        >
          <CharacterGallery
            characterId={character.id}
            onPrimaryChanged={onImageChange}
            projectId={projectId}
            refreshKey={galleryRefreshKey}
          />
        </DeferredCharacterSection>

        <DeferredCharacterSection
          description="원고에서 이 인물이 등장한 장면"
          title="등장 장면"
        >
          <CharacterAppearances
            characterId={character.id}
            projectId={projectId}
          />
        </DeferredCharacterSection>

        <DeferredCharacterSection
          description="챕터별 감정 상태와 변화"
          title="감정 타임라인"
        >
          <CharacterEmotionTimeline
            characterId={character.id}
            projectId={projectId}
          />
        </DeferredCharacterSection>

        <DeferredCharacterSection
          description="다른 인물과의 관계 설정"
          title="인물 관계"
        >
          <CharacterRelationships
            characterId={character.id}
            projectId={projectId}
          />
        </DeferredCharacterSection>
      </div>

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
