'use client';

import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ImageGenerationDialog } from '@/components/character/image-generation-dialog';

type Props = {
  projectId: string;
  characterId: string;
  characterName: string;
  currentImagePath: string | null;
  onImageChange: () => void;
};

export function CharacterImageUpload({
  projectId: _projectId,
  characterId,
  characterName,
  currentImagePath,
  onImageChange,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenDialogOpen, setIsGenDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File) => {
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(
        `/api/projects/${_projectId}/characters/${characterId}/image`,
        { method: 'POST', body: formData }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? '업로드에 실패했습니다.');
        return;
      }

      onImageChange();
    } catch {
      setError('업로드에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadImage(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadImage(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDelete = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${_projectId}/characters/${characterId}/image`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? '삭제에 실패했습니다.');
        return;
      }
      onImageChange();
    } catch {
      setError('삭제에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {currentImagePath ? (
        <div className="flex flex-col items-center gap-3">
          <div className="relative size-32 overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="캐릭터 이미지"
              className="size-full object-cover"
              src={currentImagePath}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isLoading}
              onClick={() => inputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              이미지 변경
            </Button>
            <Button
              disabled={isLoading}
              onClick={handleDelete}
              size="sm"
              type="button"
              variant="outline"
            >
              {isLoading ? '처리 중...' : '이미지 삭제'}
            </Button>
            <Button
              onClick={() => setIsGenDialogOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Sparkles className="size-4" />
              AI 생성
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-foreground/30'
          }`}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <p className="mb-3 text-sm text-muted-foreground">
            이미지를 드래그하거나
          </p>
          <div className="flex gap-2">
            <Button
              disabled={isLoading}
              onClick={() => inputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              {isLoading ? '업로드 중...' : '이미지 선택'}
            </Button>
            <Button
              onClick={() => setIsGenDialogOpen(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <Sparkles className="size-4" />
              AI 생성
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            JPG, PNG, WebP, GIF (최대 5MB)
          </p>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <input
        accept=".jpg,.jpeg,.png,.webp,.gif"
        className="hidden"
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />

      <ImageGenerationDialog
        open={isGenDialogOpen}
        onOpenChange={setIsGenDialogOpen}
        projectId={_projectId}
        characterId={characterId}
        characterName={characterName}
        onGenerated={onImageChange}
      />
    </div>
  );
}
