'use client';

import { useEffect, useState } from 'react';

type Appearance = {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
};

type Props = {
  projectId: string;
  characterId: string;
};

export function CharacterAppearances({ projectId, characterId }: Props) {
  const [appearances, setAppearances] = useState<Appearance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAppearances = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/characters/${characterId}/appearances`
        );
        if (res.ok) {
          const data = await res.json();
          setAppearances(data.appearances ?? []);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void fetchAppearances();
  }, [projectId, characterId]);

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">등장 챕터</h3>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : appearances.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 등장하는 챕터가 없습니다
        </p>
      ) : (
        <ul className="space-y-1.5">
          {appearances.map((appearance) => (
            <li
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              key={appearance.chapterId}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {appearance.chapterOrder + 1}
              </span>
              <span>{appearance.chapterTitle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
