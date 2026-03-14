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

type Character = {
  id: string;
  projectId: string;
  name: string;
  role: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  arcDescription: string | null;
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
        projectId={projectId}
        onPrimaryChanged={onImageChange}
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
