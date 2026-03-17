'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ExportDialog } from '@/components/export/export-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Project = {
  id: string;
  title: string;
  genre: string | null;
  synopsis: string | null;
  settingsJson: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export function ProjectEditForm({ project }: { project: Project }) {
  const router = useRouter();
  const [title, setTitle] = useState(project.title);
  const [genre, setGenre] = useState(project.genre ?? '');
  const [synopsis, setSynopsis] = useState(project.synopsis ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          genre: genre.trim() || null,
          synopsis: synopsis.trim() || null,
        }),
      });

      if (res.ok) {
        router.refresh();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('정말로 이 소설을 삭제하시겠습니까?')) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <Link
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          href="/"
        >
          ← 소설 목록
        </Link>
        <div className="flex items-center gap-2">
          <ExportDialog projectId={project.id} projectTitle={project.title} />
          <Link
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            href={`/projects/${project.id}/write`}
          >
            ✏️ 글쓰기 시작
          </Link>
        </div>
      </div>

      <form className="space-y-6" onSubmit={handleSave}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="title">
            제목
          </label>
          <Input
            id="title"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="소설 제목"
            required
            value={title}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="genre">
            장르
          </label>
          <Input
            id="genre"
            onChange={(e) => setGenre(e.target.value)}
            placeholder="예: 판타지, 로맨스, SF"
            value={genre}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="synopsis">
            시놉시스
          </label>
          <textarea
            className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            id="synopsis"
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder="소설의 줄거리를 간략히 작성하세요"
            value={synopsis}
          />
        </div>

        <div className="flex items-center justify-between">
          <Button disabled={isSaving || !title.trim()} type="submit">
            {isSaving ? '저장 중...' : '저장'}
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
      </form>

      {project.createdAt && (
        <p className="text-xs text-muted-foreground">
          생성일: {project.createdAt.toLocaleDateString('ko-KR')}
          {project.updatedAt && (
            <> · 수정일: {project.updatedAt.toLocaleDateString('ko-KR')}</>
          )}
        </p>
      )}
    </>
  );
}
