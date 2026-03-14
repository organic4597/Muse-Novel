'use client';

import { useEffect, useState } from 'react';
import { Loader2, Star, Trash2, X, ZoomIn } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type GalleryImage = {
  id: string;
  imagePath: string;
  kind: string;
  prompt: string | null;
  negativePrompt: string | null;
  width: number | null;
  height: number | null;
  seed: number | null;
  isPrimary: number | null;
  createdAt: string | null;
};

const KIND_BADGES: Record<string, { label: string; className: string }> = {
  profile: {
    label: '프로필',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  },
  'full-body': {
    label: '전신',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  illustration: {
    label: '일러스트',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  },
};

type Props = {
  projectId: string;
  characterId: string;
  onPrimaryChanged: () => void;
  refreshKey?: number;
};

export function CharacterGallery({
  projectId,
  characterId,
  onPrimaryChanged,
  refreshKey,
}: Props) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomedImage, setZoomedImage] = useState<GalleryImage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchImages = async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/images`
      );
      if (res.ok) {
        const data = (await res.json()) as GalleryImage[];
        setImages(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, [projectId, characterId, refreshKey]);

  const handleSetPrimary = async (imageId: string) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/images/${imageId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPrimary: true }),
        }
      );
      if (res.ok) {
        setImages((prev) =>
          prev.map((img) => ({
            ...img,
            isPrimary: img.id === imageId ? 1 : 0,
          }))
        );
        onPrimaryChanged();
      }
    } catch {
      // ignore
    }
  };

  const handleDelete = async (imageId: string) => {
    setDeletingId(imageId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/images/${imageId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        const deleted = images.find((img) => img.id === imageId);
        setImages((prev) => prev.filter((img) => img.id !== imageId));
        if (deleted?.isPrimary === 1) {
          onPrimaryChanged();
        }
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        이미지 갤러리 ({images.length})
      </h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((img) => {
          const badge = KIND_BADGES[img.kind] ?? KIND_BADGES.profile;
          return (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-lg border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="캐릭터 이미지"
                className="aspect-square w-full cursor-pointer object-cover"
                src={img.imagePath}
                onClick={() => setZoomedImage(img)}
              />
              {/* Kind badge */}
              <span
                className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
              {/* Primary badge */}
              {img.isPrimary === 1 && (
                <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  대표
                </span>
              )}
              {/* Hover actions */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setZoomedImage(img)}
                >
                  <ZoomIn className="size-3" />
                </Button>
                {img.isPrimary !== 1 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => handleSetPrimary(img.id)}
                  >
                    <Star className="size-3" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 px-2 text-[10px]"
                  disabled={deletingId === img.id}
                  onClick={() => handleDelete(img.id)}
                >
                  {deletingId === img.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Zoom Dialog */}
      {zoomedImage && (
        <Dialog
          open={!!zoomedImage}
          onOpenChange={(open) => !open && setZoomedImage(null)}
        >
          <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                이미지 상세
                {zoomedImage.width && zoomedImage.height && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {zoomedImage.width}×{zoomedImage.height}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="캐릭터 이미지 확대"
                className="w-full rounded-lg"
                src={zoomedImage.imagePath}
              />
              {zoomedImage.prompt && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">프롬프트</p>
                  <p className="mt-0.5 text-sm">{zoomedImage.prompt}</p>
                </div>
              )}
              {zoomedImage.seed != null && zoomedImage.seed !== -1 && (
                <p className="text-xs text-muted-foreground">
                  Seed: {zoomedImage.seed}
                </p>
              )}
              <div className="flex gap-2">
                {zoomedImage.isPrimary !== 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handleSetPrimary(zoomedImage.id);
                      setZoomedImage((prev) =>
                        prev ? { ...prev, isPrimary: 1 } : null
                      );
                    }}
                  >
                    <Star className="size-4" />
                    대표로 지정
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    handleDelete(zoomedImage.id);
                    setZoomedImage(null);
                  }}
                >
                  <Trash2 className="size-4" />
                  삭제
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
