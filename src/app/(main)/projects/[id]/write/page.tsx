'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';

import { ChapterSidebar } from '@/components/chapter/chapter-sidebar';
import { AutoSaveIndicator } from '@/components/editor/auto-save-indicator';
import { PlateEditor } from '@/components/editor/plate-editor';
import { useAutoSave } from '@/hooks/use-auto-save';
import { convertToPlainText } from '@/lib/export/export-text';

interface Chapter {
  id: string;
  projectId: string;
  title: string;
  order: number;
  contentJson: string | null;
}

export default function WritePage() {
  const params = useParams<{ id: string }>();
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [textStats, setTextStats] = useState({ characterCount: 0, byteSize: 0 });

  const autoSave = useAutoSave({
    projectId: params.id,
    chapterId: selectedChapter?.id ?? '',
    enabled: selectedChapter !== null,
  });

  const handleContentChange = (content: string) => {
    const plainText = convertToPlainText(content);
    setTextStats({
      characterCount: plainText.length,
      byteSize: new TextEncoder().encode(plainText).length,
    });
    autoSave.save(content);
  };

  const handleSelectChapter = async (chapter: Chapter) => {
    // Flush any pending save for current chapter before switching
    if (selectedChapter) {
      autoSave.flush();
    }

    // Fetch full chapter data to get contentJson
    const res = await fetch(
      `/api/projects/${params.id}/chapters/${chapter.id}`
    );

    if (res.ok) {
      const fullChapter: Chapter = await res.json();

      // Check localStorage for unsaved backup
      const backupKey = `muse-novel-backup-${chapter.id}`;
      const backup = localStorage.getItem(backupKey);

      if (backup && backup !== fullChapter.contentJson) {
        const restore = window.confirm(
          '저장되지 않은 변경사항이 있습니다. 복원하시겠습니까?'
        );

        if (restore) {
          const plainText = convertToPlainText(backup);
          setTextStats({
            characterCount: plainText.length,
            byteSize: new TextEncoder().encode(plainText).length,
          });
          setSelectedChapter({ ...fullChapter, contentJson: backup });
        } else {
          localStorage.removeItem(backupKey);
          const plainText = convertToPlainText(fullChapter.contentJson);
          setTextStats({
            characterCount: plainText.length,
            byteSize: new TextEncoder().encode(plainText).length,
          });
          setSelectedChapter(fullChapter);
        }
      } else {
        const plainText = convertToPlainText(fullChapter.contentJson);
        setTextStats({
          characterCount: plainText.length,
          byteSize: new TextEncoder().encode(plainText).length,
        });
        setSelectedChapter(fullChapter);
      }
    }
  };

  const handleRetry = () => {
    autoSave.flush();
  };

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0">
        <ChapterSidebar
          onSelectChapter={handleSelectChapter}
          selectedChapterId={selectedChapter?.id ?? null}
        />
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col">
          <h1 className="sr-only">소설 작성</h1>
          {selectedChapter ? (
            <>
              <div className="flex h-7 items-center justify-between gap-3 px-2 py-1">
                <div className="text-xs text-muted-foreground">
                  {textStats.characterCount.toLocaleString()}자 · {textStats.byteSize.toLocaleString()} bytes
                </div>
                <AutoSaveIndicator
                  onRetry={handleRetry}
                  status={autoSave.status}
                />
              </div>
              <PlateEditor
                chapterId={selectedChapter.id}
                content={selectedChapter.contentJson}
                key={selectedChapter.id}
                onValueChange={handleContentChange}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                챕터를 선택하세요
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
