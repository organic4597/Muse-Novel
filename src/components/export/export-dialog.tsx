'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export type ExportFormat = 'txt' | 'md' | 'epub';

interface ExportDialogProps {
  projectId: string;
  projectTitle?: string;
}

/**
 * Export dialog component for downloading projects in different formats
 * Korean UI with format selection (Plain Text, Markdown, EPUB disabled)
 */
export function ExportDialog({
  projectId,
  projectTitle = '프로젝트',
}: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('txt');
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      // Trigger download by navigating to API endpoint
      const url = `/api/projects/${projectId}/export/${selectedFormat}`;
      window.location.href = url;
      setOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button variant="outline">내보내기</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>프로젝트 내보내기</DialogTitle>
          <DialogDescription>
            {projectTitle}를 원하는 형식으로 내보내세요
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-3">
            <label className="text-sm font-medium">형식 선택</label>
            <div className="space-y-3 border rounded-lg p-3">
              <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-muted rounded">
                <input
                  checked={selectedFormat === 'txt'}
                  className="w-4 h-4"
                  name="format"
                  onChange={(e) =>
                    setSelectedFormat(e.target.value as ExportFormat)
                  }
                  type="radio"
                  value="txt"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">텍스트 (Plain Text)</div>
                  <div className="text-xs text-muted-foreground">
                    .txt 파일로 내보내기
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-muted rounded">
                <input
                  checked={selectedFormat === 'md'}
                  className="w-4 h-4"
                  name="format"
                  onChange={(e) =>
                    setSelectedFormat(e.target.value as ExportFormat)
                  }
                  type="radio"
                  value="md"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">마크다운 (Markdown)</div>
                  <div className="text-xs text-muted-foreground">
                    .md 파일로 내보내기
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-muted rounded">
                <input
                  checked={selectedFormat === 'epub'}
                  className="w-4 h-4"
                  name="format"
                  onChange={(e) =>
                    setSelectedFormat(e.target.value as ExportFormat)
                  }
                  type="radio"
                  value="epub"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">EPUB</div>
                  <div className="text-xs text-muted-foreground">
                    .epub 파일로 내보내기
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            disabled={isLoading}
            onClick={() => setOpen(false)}
            variant="outline"
          >
            취소
          </Button>
          <Button disabled={isLoading} onClick={handleExport}>
            {isLoading ? '다운로드 중...' : '내보내기'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
