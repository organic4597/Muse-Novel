'use client';

import { Button } from '@/components/ui/button';

type SuggestionField = {
  key: string;
  label: string;
  value: string | string[];
};

export function StructuredFieldSuggestions({
  description,
  error,
  fields,
  isLoading,
  onApplyAll,
  onApplyField,
  onDescriptionChange,
  onGenerate,
  title,
}: {
  description: string;
  error?: string | null;
  fields: SuggestionField[];
  isLoading: boolean;
  onApplyAll: () => void;
  onApplyField: (key: string) => void;
  onDescriptionChange: (value: string) => void;
  onGenerate: () => void;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            짧게 설명하면 항목별 초안을 제안합니다. 확인한 항목만 폼에 반영됩니다.
          </p>
        </div>
        {fields.length > 1 && (
          <Button
            onClick={onApplyAll}
            size="sm"
            type="button"
            variant="outline"
          >
            전체 적용
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-3">
        <textarea
          className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="예: 몰락한 귀족 가문의 마지막 후계자인 19세 여성 마법사. 겉으로는 차갑지만 동생 앞에서는 약하다. 금지된 주문을 익히며 타락과 구원의 경계에 선 인물."
          value={description}
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            설명이 짧아도 되지만, 관계·배경·분위기를 넣으면 제안 품질이 좋아집니다.
          </p>
          <Button
            disabled={isLoading || !description.trim()}
            onClick={onGenerate}
            size="sm"
            type="button"
          >
            {isLoading ? '제안 생성 중...' : '제안 받기'}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {fields.length > 0 && (
          <div className="grid gap-3">
            {fields.map((field) => (
              <div
                className="rounded-lg border border-border bg-background p-3"
                key={field.key}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </p>
                    {Array.isArray(field.value) ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {field.value.map((item) => (
                          <span
                            className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                            key={item}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {field.value}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => onApplyField(field.key)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    적용
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}