'use client';

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
        const project = await res.json();
        setTitle('');
        setIsOpen(false);
        router.push('/');
        router.refresh();
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        새 소설
      </Button>
    );
  }

  return (
    <form className="flex items-center gap-2" onSubmit={handleSubmit}>
      <Input
        autoFocus
        disabled={isLoading}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="소설 제목을 입력하세요"
        value={title}
      />
      <Button disabled={isLoading || !title.trim()} type="submit">
        생성
      </Button>
      <Button
        onClick={() => {
          setIsOpen(false);
          setTitle('');
        }}
        type="button"
        variant="outline"
      >
        취소
      </Button>
    </form>
  );
}
