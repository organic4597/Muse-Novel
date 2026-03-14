'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ROLE_OPTIONS = ['주인공', '조연', '악역', '조력자', '기타'] as const;

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

export function CharacterForm({
  projectId,
  character,
  onSuccess,
}: {
  projectId: string;
  character?: Character;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const isEditing = !!character;

  const [name, setName] = useState(character?.name ?? '');
  const [role, setRole] = useState(character?.role ?? '');
  const [appearance, setAppearance] = useState(character?.appearance ?? '');
  const [personality, setPersonality] = useState(character?.personality ?? '');
  const [backstory, setBackstory] = useState(character?.backstory ?? '');
  const [arcDescription, setArcDescription] = useState(
    character?.arcDescription ?? ''
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      const url = isEditing
        ? `/api/projects/${projectId}/characters/${character.id}`
        : `/api/projects/${projectId}/characters`;

      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role || null,
          appearance: appearance.trim() || null,
          personality: personality.trim() || null,
          backstory: backstory.trim() || null,
          arcDescription: arcDescription.trim() || null,
        }),
      });

      if (res.ok) {
        router.refresh();
        onSuccess?.();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="char-name">
          이름 <span className="text-destructive">*</span>
        </label>
        <Input
          autoFocus
          disabled={isLoading}
          id="char-name"
          onChange={(e) => setName(e.target.value)}
          placeholder="캐릭터 이름"
          required
          value={name}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="char-role">
          역할
        </label>
        <select
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          disabled={isLoading}
          id="char-role"
          onChange={(e) => setRole(e.target.value)}
          value={role}
        >
          <option value="">선택하세요</option>
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="char-appearance">
          외모
        </label>
        <textarea
          className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          disabled={isLoading}
          id="char-appearance"
          onChange={(e) => setAppearance(e.target.value)}
          placeholder="캐릭터의 외모를 묘사하세요"
          value={appearance}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="char-personality">
          성격
        </label>
        <textarea
          className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          disabled={isLoading}
          id="char-personality"
          onChange={(e) => setPersonality(e.target.value)}
          placeholder="캐릭터의 성격을 묘사하세요"
          value={personality}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="char-backstory">
          배경
        </label>
        <textarea
          className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          disabled={isLoading}
          id="char-backstory"
          onChange={(e) => setBackstory(e.target.value)}
          placeholder="캐릭터의 배경 이야기를 작성하세요"
          value={backstory}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="char-arc">
          캐릭터 아크
        </label>
        <textarea
          className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          disabled={isLoading}
          id="char-arc"
          onChange={(e) => setArcDescription(e.target.value)}
          placeholder="캐릭터의 변화와 성장을 묘사하세요"
          value={arcDescription}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button disabled={isLoading || !name.trim()} type="submit">
          {isLoading ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}
