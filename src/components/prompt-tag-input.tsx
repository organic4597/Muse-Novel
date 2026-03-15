'use client';

import { Loader2, SparklesIcon, XIcon, WandSparklesIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/utils';

interface TagSuggestion {
  tag: string;
  category: string;
  categoryLabel: string;
  color: string;
}

interface RecommendedTag extends TagSuggestion {
  reason: string;
  score?: number;
}

interface CategorySummary {
  id: string;
  label: string;
  color: string;
  count: number;
  tags: string[];
}

interface PromptTagInputProps {
  /** Comma-separated prompt string */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Character ID for tag recommendations */
  characterId?: string;
}

/** Parse "tag1, tag2, tag3" into array of trimmed tags */
function parseTags(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Join tags back into comma-separated string */
function joinTags(tags: string[]): string {
  return tags.join(', ');
}

export function PromptTagInput({
  value,
  onChange,
  placeholder = '태그를 입력하세요...',
  disabled = false,
  className,
  characterId,
}: PromptTagInputProps) {
  const tags = parseTags(value);
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [browsingCategory, setBrowsingCategory] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Character recommendation state
  const [showRecommend, setShowRecommend] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendedTag[]>([]);
  const [recommendLoading, setRecommendLoading] = useState(false);

  // Description-to-tag state
  const [showDescConvert, setShowDescConvert] = useState(false);
  const [descText, setDescText] = useState('');
  const [descTags, setDescTags] = useState<RecommendedTag[]>([]);
  const [descLoading, setDescLoading] = useState(false);

  // Load categories on mount
  useEffect(() => {
    fetch('/api/prompt-tags')
      .then((r) => r.json())
      .then((data: CategorySummary[]) => setCategories(data))
      .catch(() => {});
  }, []);

  // Search tags when input changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!inputValue.trim()) {
      setSuggestions([]);
      setBrowsingCategory(null);
      setSelectedIndex(0);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const q = encodeURIComponent(inputValue.trim());
      fetch(`/api/prompt-tags?q=${q}`)
        .then((r) => r.json())
        .then((data: TagSuggestion[]) => {
          setSuggestions(data);
          setBrowsingCategory(null);
          setSelectedIndex(0);
          setIsOpen(true);
        })
        .catch(() => {});
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (!trimmed) return;
      if (tags.some((t) => t.toLowerCase() === trimmed)) {
        setInputValue('');
        return;
      }
      const newTags = [...tags, trimmed];
      onChange(joinTags(newTags));
      setInputValue('');
      setSuggestions([]);
      setBrowsingCategory(null);
      setSelectedIndex(0);
      inputRef.current?.focus();
    },
    [tags, onChange]
  );

  const addMultipleTags = useCallback(
    (newTagList: string[]) => {
      const existing = new Set(tags.map((t) => t.toLowerCase()));
      const toAdd = newTagList
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t && !existing.has(t));
      if (toAdd.length === 0) return;
      onChange(joinTags([...tags, ...toAdd]));
    },
    [tags, onChange]
  );

  const removeTag = useCallback(
    (index: number) => {
      const newTags = tags.filter((_, i) => i !== index);
      onChange(joinTags(newTags));
    },
    [tags, onChange]
  );

  const browseCategory = useCallback(
    (catId: string) => {
      setBrowsingCategory(catId);
      fetch(`/api/prompt-tags?cat=${encodeURIComponent(catId)}`)
        .then((r) => r.json())
        .then((data: TagSuggestion[]) => {
          setSuggestions(data);
          setSelectedIndex(0);
        })
        .catch(() => {});
    },
    []
  );

  // Character-based tag recommendation
  const fetchRecommendations = useCallback(async () => {
    if (!characterId) return;
    setRecommendLoading(true);
    setShowRecommend(true);
    setShowDescConvert(false);
    try {
      const res = await fetch(
        `/api/prompt-tags/recommend?characterId=${encodeURIComponent(characterId)}`
      );
      const data = await res.json();
      setRecommendations(data.recommendations ?? []);
    } catch {
      setRecommendations([]);
    } finally {
      setRecommendLoading(false);
    }
  }, [characterId]);

  // Description to tags
  const convertDescription = useCallback(async () => {
    if (!descText.trim()) return;
    setDescLoading(true);
    try {
      const res = await fetch('/api/prompt-tags/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descText }),
      });
      const data = await res.json();
      setDescTags(data.tags ?? []);
    } catch {
      setDescTags([]);
    } finally {
      setDescLoading(false);
    }
  }, [descText]);

  // Get display items for dropdown
  const displayItems = (): TagSuggestion[] | 'categories' => {
    if (inputValue.trim() || browsingCategory) return suggestions;
    return 'categories';
  };

  const items = displayItems();
  const listItems = items === 'categories' ? [] : items;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (listItems.length > 0 && isOpen) {
        addTag(listItems[selectedIndex]?.tag ?? inputValue);
      } else {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items === 'categories') {
        if (categories.length > 0) {
          browseCategory(categories[0].id);
        }
      } else {
        setSelectedIndex((i) => Math.min(i + 1, listItems.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setBrowsingCategory(null);
    } else if (e.key === 'Tab' && isOpen && listItems.length > 0) {
      e.preventDefault();
      addTag(listItems[selectedIndex]?.tag ?? inputValue);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (!dropdownRef.current) return;
    const el = dropdownRef.current.querySelector('[data-selected="true"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const colorDot = (color: string) => (
    <span
      className="inline-block size-2 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  );

  return (
    <div ref={containerRef} className={cn('space-y-2', className)}>
      {/* Toolbar buttons */}
      <div className="flex flex-wrap gap-1.5">
        {characterId && (
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
              showRecommend
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-primary'
            )}
            onClick={fetchRecommendations}
          >
            <SparklesIcon className="size-3" />
            캐릭터 추천
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
            showDescConvert
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/50 hover:text-primary'
          )}
          onClick={() => {
            setShowDescConvert(!showDescConvert);
            setShowRecommend(false);
          }}
        >
          <WandSparklesIcon className="size-3" />
          설명→태그 변환
        </button>
      </div>

      {/* Character recommendations panel */}
      {showRecommend && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-primary">캐릭터 기반 추천 태그</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowRecommend(false)}
            >
              닫기
            </button>
          </div>
          {recommendLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              캐릭터 정보 분석 중...
            </div>
          ) : recommendations.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1">
                {recommendations.map((rec) => {
                  const already = tags.some(
                    (t) => t.toLowerCase() === rec.tag.toLowerCase()
                  );
                  return (
                    <button
                      key={`${rec.tag}-${rec.reason}`}
                      type="button"
                      disabled={already}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors',
                        already
                          ? 'bg-muted text-muted-foreground opacity-50'
                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                      )}
                      onClick={() => addTag(rec.tag)}
                      title={`${rec.categoryLabel} — ${rec.reason}에서 추출${rec.score ? ` (${Math.round(rec.score * 100)}%)` : ''}`}
                    >
                      {colorDot(rec.color)}
                      {rec.tag}
                      {rec.score && (
                        <span className="text-[10px] text-muted-foreground">
                          {Math.round(rec.score * 100)}%
                        </span>
                      )}
                      {already && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() =>
                  addMultipleTags(recommendations.map((r) => r.tag))
                }
              >
                추천 태그 전체 추가
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground py-1">
              캐릭터 정보에서 매칭되는 태그가 없습니다. 외모/성격 등을 상세히 입력해보세요.
            </p>
          )}
        </div>
      )}

      {/* Description-to-tag converter */}
      {showDescConvert && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-primary">설명 → 태그 변환</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setShowDescConvert(false);
                setDescTags([]);
              }}
            >
              닫기
            </button>
          </div>
          <div className="flex gap-2">
            <textarea
              className="flex-1 min-h-[40px] max-h-[80px] rounded-md border border-input bg-transparent px-2 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              placeholder="예: 빨간 머리에 파란 눈의 소녀가 숲에서 검을 들고 서있는 모습"
              value={descText}
              onChange={(e) => setDescText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  convertDescription();
                }
              }}
            />
            <button
              type="button"
              disabled={descLoading || !descText.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shrink-0"
              onClick={convertDescription}
            >
              {descLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                '변환'
              )}
            </button>
          </div>
          {descTags.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1">
                {descTags.map((dt) => {
                  const already = tags.some(
                    (t) => t.toLowerCase() === dt.tag.toLowerCase()
                  );
                  return (
                    <button
                      key={`${dt.tag}-${dt.category}`}
                      type="button"
                      disabled={already}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors',
                        already
                          ? 'bg-muted text-muted-foreground opacity-50'
                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                      )}
                      onClick={() => addTag(dt.tag)}
                      title={`${dt.categoryLabel} (${Math.round((dt.score ?? 0) * 100)}%)`}
                    >
                      {colorDot(dt.color)}
                      {dt.tag}
                      {dt.score && (
                        <span className="text-[10px] text-muted-foreground">
                          {Math.round(dt.score * 100)}%
                        </span>
                      )}
                      {already && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => addMultipleTags(descTags.map((d) => d.tag))}
              >
                변환 결과 전체 추가
              </button>
            </>
          )}
        </div>
      )}

      {/* Tag chips + input area */}
      <div className="relative">
        <div
          className={cn(
            'flex min-h-[60px] w-full flex-wrap gap-1.5 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors',
            'focus-within:ring-1 focus-within:ring-ring',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {tags.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
            >
              {tag}
              {!disabled && (
                <button
                  type="button"
                  className="hover:text-destructive transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(i);
                  }}
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            placeholder={tags.length === 0 ? placeholder : '태그 추가...'}
            disabled={disabled}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Autocomplete dropdown */}
        {isOpen && !disabled && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden"
          >
            {items === 'categories' ? (
              /* Category browser */
              <div className="max-h-[250px] overflow-y-auto p-1">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  카테고리별 태그 찾아보기
                </div>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => browseCategory(cat.id)}
                  >
                    {colorDot(cat.color)}
                    <span>{cat.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {cat.count}개
                    </span>
                  </button>
                ))}
              </div>
            ) : listItems.length > 0 ? (
              /* Tag suggestions */
              <div className="max-h-[250px] overflow-y-auto p-1">
                {browsingCategory && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-1 rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors mb-1"
                    onClick={() => {
                      setBrowsingCategory(null);
                      setSuggestions([]);
                      setSelectedIndex(0);
                    }}
                  >
                    ← 카테고리로 돌아가기
                  </button>
                )}
                {listItems.map((item, i) => {
                  const alreadyAdded = tags.some(
                    (t) => t.toLowerCase() === item.tag.toLowerCase()
                  );
                  return (
                    <button
                      key={`${item.tag}-${item.category}`}
                      type="button"
                      data-selected={i === selectedIndex}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors',
                        i === selectedIndex
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50',
                        alreadyAdded && 'opacity-40'
                      )}
                      onClick={() => addTag(item.tag)}
                    >
                      {colorDot(item.color)}
                      <span className={cn(alreadyAdded && 'line-through')}>
                        {item.tag}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {item.categoryLabel}
                      </span>
                      {alreadyAdded && (
                        <span className="text-xs text-muted-foreground">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : inputValue.trim() ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                <p>&apos;{inputValue}&apos; — Enter로 직접 추가</p>
              </div>
            ) : null}

            {/* Quick category filters at bottom */}
            {!browsingCategory && listItems.length > 0 && (
              <div className="flex flex-wrap gap-1 border-t border-border px-2 py-1.5">
                {categories.slice(0, 8).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
                    onClick={() => browseCategory(cat.id)}
                  >
                    {colorDot(cat.color)}
                    {cat.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
