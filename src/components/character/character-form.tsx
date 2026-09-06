'use client';

import { useState } from 'react';
import { StructuredFieldSuggestions } from '@/components/ai/structured-field-suggestions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CharacterItem } from '@/lib/ai/story-planning-types';

const ROLE_OPTIONS = ['주인공', '조연', '악역', '조력자', '기타'] as const;

type CharacterSuggestion = {
  name?: string;
  role?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  arcDescription?: string;
  items?: CharacterItem[];
};

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

export function CharacterForm({
  projectId,
  character,
  onSuccess,
}: {
  projectId: string;
  character?: Character;
  onSuccess?: (character: Character) => void;
}) {
  const isEditing = !!character;

  const [name, setName] = useState(character?.name ?? '');
  const [role, setRole] = useState(character?.role ?? '');
  const [appearance, setAppearance] = useState(character?.appearance ?? '');
  const [personality, setPersonality] = useState(character?.personality ?? '');
  const [backstory, setBackstory] = useState(character?.backstory ?? '');
  const [arcDescription, setArcDescription] = useState(
    character?.arcDescription ?? ''
  );
  const [items, setItems] = useState<CharacterItem[]>(() => {
    try {
      return JSON.parse(character?.itemsJson ?? '[]');
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [suggestionPrompt, setSuggestionPrompt] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CharacterSuggestion | null>(null);

  const suggestionFields = [
    suggestion?.name ? { key: 'name', label: '이름', value: suggestion.name } : null,
    suggestion?.role ? { key: 'role', label: '역할', value: suggestion.role } : null,
    suggestion?.appearance ? { key: 'appearance', label: '외모', value: suggestion.appearance } : null,
    suggestion?.personality ? { key: 'personality', label: '성격', value: suggestion.personality } : null,
    suggestion?.backstory ? { key: 'backstory', label: '배경', value: suggestion.backstory } : null,
    suggestion?.arcDescription
      ? { key: 'arcDescription', label: '캐릭터 아크', value: suggestion.arcDescription }
      : null,
    suggestion?.items?.length
      ? { key: 'items', label: '소지품', value: suggestion.items.map((i) => i.name).join(', ') }
      : null,
  ].filter((field): field is { key: string; label: string; value: string } => Boolean(field));

  const applySuggestionField = (key: string) => {
    switch (key) {
      case 'name':
        if (suggestion?.name) setName(suggestion.name);
        return;
      case 'role':
        if (suggestion?.role && ROLE_OPTIONS.includes(suggestion.role as typeof ROLE_OPTIONS[number])) {
          setRole(suggestion.role);
        }
        return;
      case 'appearance':
        if (suggestion?.appearance) setAppearance(suggestion.appearance);
        return;
      case 'personality':
        if (suggestion?.personality) setPersonality(suggestion.personality);
        return;
      case 'backstory':
        if (suggestion?.backstory) setBackstory(suggestion.backstory);
        return;
      case 'arcDescription':
        if (suggestion?.arcDescription) setArcDescription(suggestion.arcDescription);
        return;
      case 'items':
        setItems(suggestion?.items ?? []);
        return;
      default:
        return;
    }
  };

  const handleSuggest = async () => {
    if (!suggestionPrompt.trim()) return;

    setIsSuggesting(true);
    setSuggestionError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/characters/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: suggestionPrompt.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSuggestionError(data.error ?? '캐릭터 제안을 가져오지 못했습니다.');
        return;
      }

      setSuggestion(data as CharacterSuggestion);
    } catch {
      setSuggestionError('캐릭터 제안을 가져오지 못했습니다.');
    } finally {
      setIsSuggesting(false);
    }
  };

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
          itemsJson: items.length > 0 ? JSON.stringify(items) : null,
        }),
      });

      if (res.ok) {
        const savedCharacter = await res.json() as Character;
        onSuccess?.(savedCharacter);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {!isEditing && (
        <StructuredFieldSuggestions
          description={suggestionPrompt}
          error={suggestionError}
          fields={suggestionFields}
          isLoading={isSuggesting}
          onApplyAll={() => {
            suggestionFields.forEach((field) => {
              applySuggestionField(field.key);
            });
          }}
          onApplyField={applySuggestionField}
          onDescriptionChange={setSuggestionPrompt}
          onGenerate={handleSuggest}
          title="설명으로 캐릭터 초안 만들기"
        />
      )}

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

      <div className="space-y-2">
        <label className="text-sm font-medium">🎒 소지품</label>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div className="flex items-start gap-2" key={index}>
              <Input
                className="flex-1"
                disabled={isLoading}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], name: e.target.value };
                  setItems(next);
                }}
                placeholder="이름"
                value={item.name}
              />
              <Input
                className="flex-1"
                disabled={isLoading}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], description: e.target.value };
                  setItems(next);
                }}
                placeholder="설명"
                value={item.description ?? ''}
              />
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                disabled={isLoading}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], status: e.target.value };
                  setItems(next);
                }}
                value={item.status ?? '보유'}
              >
                <option value="보유">보유</option>
                <option value="장착중">장착중</option>
                <option value="분실">분실</option>
                <option value="기타">기타</option>
              </select>
              <button
                className="mt-1 text-muted-foreground hover:text-destructive"
                disabled={isLoading}
                onClick={() => setItems(items.filter((_, i) => i !== index))}
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <Button
          disabled={isLoading}
          onClick={() => setItems([...items, { name: '', description: '', status: '보유' }])}
          size="sm"
          type="button"
          variant="outline"
        >
          항목 추가
        </Button>
      </div>

      <div className="flex justify-end gap-2">
        <Button disabled={isLoading || !name.trim()} type="submit">
          {isLoading ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}
