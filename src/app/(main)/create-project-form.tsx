'use client';

import { ArrowRight, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CreateProjectForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });

      if (res.ok) {
        const project = (await res.json()) as { id: string };
        setTitle('');
        setIsOpen(false);
        router.push(`/projects/${encodeURIComponent(project.id)}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} size="lg">
        <Plus />
        새 소설
      </Button>
    );
  }

  return (
    <form
      className="muse-panel flex w-full flex-col gap-3 p-3 sm:w-auto sm:min-w-[31rem] sm:flex-row sm:items-center"
      onSubmit={handleSubmit}
    >
      <Input
        autoFocus
        disabled={isLoading}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="소설 제목을 입력하세요"
        value={title}
      />
      <Button disabled={isLoading || !title.trim()} type="submit">
        {isLoading ? '생성 중' : '생성'}
        <ArrowRight />
      </Button>
      <Button
        onClick={() => {
          setIsOpen(false);
          setTitle('');
        }}
        type="button"
        variant="outline"
      >
        <X />
        <span className="sm:sr-only">취소</span>
      </Button>
    </form>
  );
}
