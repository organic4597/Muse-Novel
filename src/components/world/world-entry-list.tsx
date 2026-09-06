'use client';

import { ArrowUpRight, Globe2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EntityRevisionPanel } from '@/components/ai/entity-revision-panel';
import { AdaptiveDetailDialogContent } from '@/components/ui/adaptive-detail-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_PROGRESSIVE_PAGE_SIZE,
  nextProgressiveCount,
  ProgressiveListControls,
} from '@/components/ui/progressive-list-controls';
import { WorldBuilderAssistant } from '@/components/world/world-builder-assistant';
import { WorldEntryDetail } from '@/components/world/world-entry-detail';
import { WorldEntryForm } from '@/components/world/world-entry-form';
import { WorldSearch } from '@/components/world/world-search';
import { splitResearchContent } from '@/lib/web-research/content';
import type { WorldCategoryTrait } from '@/lib/world-categories';
import { getWorldCategoryOptions, resolveWorldCategoryName, type WorldCategoryRecord } from '@/lib/world-categories';

type WorldEntry = {
  id: string;
  projectId: string;
  tags?: Array<{ id: string; tag: string }>;
  category: string;
  title: string;
  content: string | null;
  researchJson?: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

const CATEGORY_COLORS: Record<string, string> = {
  '장소': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  '마법': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  '종족': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  '문화': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  '역사': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  '기술': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  '사건': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  '물건': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  '기타': 'bg-secondary text-secondary-foreground',
};

const DEFAULT_CATEGORY_COLOR = 'bg-secondary text-secondary-foreground';
const CATEGORY_TRAIT_LABELS: Record<WorldCategoryTrait, string> = { organization: '단체', location: '장소·지형', item: '물건' };

export function WorldEntryList({
  projectId,
  entries,
  savedCategories = [],
  categoryRecords = [],
}: {
  projectId: string;
  entries: WorldEntry[];
  savedCategories?: string[];
  categoryRecords?: WorldCategoryRecord[];
}) {
  const [localEntries, setLocalEntries] = useState(entries);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WorldEntry | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [customCategories, setCustomCategories] = useState(savedCategories);
  const [localCategoryRecords, setLocalCategoryRecords] = useState(categoryRecords);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [categoryMessage, setCategoryMessage] = useState('');
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryPending, setCategoryPending] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [traitCategory, setTraitCategory] = useState<WorldCategoryRecord | null>(null);
  const [traitDraft, setTraitDraft] = useState<WorldCategoryTrait[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [visibleEntryCount, setVisibleEntryCount] = useState(
    DEFAULT_PROGRESSIVE_PAGE_SIZE
  );

  useEffect(() => {
    setLocalEntries(entries);
  }, [entries]);

  useEffect(() => {
    setVisibleEntryCount(DEFAULT_PROGRESSIVE_PAGE_SIZE);
  }, [activeCategory, activeTag]);

  const mergeEntries = (nextEntries: WorldEntry[]) => {
    setLocalEntries((currentEntries) => {
      const incomingIds = new Set(nextEntries.map((entry) => entry.id));
      const currentById = new Map(currentEntries.map((entry) => [entry.id, entry]));
      const merged = nextEntries.map((entry) => ({ ...currentById.get(entry.id), ...entry,
        tags: entry.tags ?? currentById.get(entry.id)?.tags,
      } as WorldEntry));
      return [...merged, ...currentEntries.filter((entry) => !incomingIds.has(entry.id))];
    });
  };

  const liveEntries = useMemo(
    () => localEntries.filter((entry) => !deletedIds.has(entry.id)),
    [deletedIds, localEntries]
  );
  const categories = useMemo(
    () => getWorldCategoryOptions(localCategoryRecords, [...savedCategories, ...customCategories, ...liveEntries.map((entry) => entry.category)]),
    [liveEntries, customCategories, savedCategories, localCategoryRecords]
  );
  const displayEntries = useMemo(
    () =>
      activeTag
        ? liveEntries.filter((entry) =>
            entry.tags?.some(({ tag }) => tag === activeTag)
          )
        : activeCategory
          ? liveEntries.filter((entry) => entry.category === activeCategory)
          : liveEntries,
    [activeCategory, activeTag, liveEntries]
  );
  const renderedEntries = displayEntries.slice(0, visibleEntryCount);
  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of displayEntries) {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + 1);
    }
    return totals;
  }, [displayEntries]);
  const groupedEntries = renderedEntries.reduce<Record<string, WorldEntry[]>>(
    (acc, entry) => {
      if (!acc[entry.category]) acc[entry.category] = [];
      acc[entry.category].push(entry);
      return acc;
    },
    {}
  );

  const handleTagClick = (tag: string) => {
    if (activeTag === tag) {
      setActiveTag(null);
      return;
    }

    setActiveTag(tag);
    setActiveCategory(null);
  };

  const handleCategoryFilter = (cat: string | null) => {
    setActiveCategory(cat);
    setActiveTag(null);
  };

  const handleCreateCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = categoryName.normalize('NFKC').trim();
    if (!name || categoryPending) return;
    setCategoryPending(true);
    setCategoryError('');
    setCategoryMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/world-categories`, {
        method: renamingCategory ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...(renamingCategory ? { oldName: renamingCategory } : {}) }),
      });
      const result = await response.json() as { name?: string; error?: string; categories?: WorldCategoryRecord[]; updatedEntries?: number };
      if (!response.ok || !result.name) {
        throw new Error(result.error ?? '카테고리를 저장하지 못했습니다.');
      }
      const savedName = result.name;
      if (renamingCategory && result.categories) {
        const records = result.categories;
        setLocalCategoryRecords(records);
        setLocalEntries((current) => current.map((entry) => ({ ...entry, category: resolveWorldCategoryName(records, entry.category) })));
        setSelectedEntry((current) => current ? { ...current, category: resolveWorldCategoryName(records, current.category) } : null);
        setCategoryMessage(`“${renamingCategory}” → “${savedName}” 변경 완료 · 기존 항목 ${result.updatedEntries ?? 0}개에 반영했습니다.`);
      }
      setCustomCategories((current) => [...new Set([...current, savedName])]);
      handleCategoryFilter(savedName);
      setIsCategoryFormOpen(false);
      setCategoryName('');
      setRenamingCategory(null);
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : '카테고리를 저장하지 못했습니다.');
    } finally {
      setCategoryPending(false);
    }
  };

  const handleDeleteCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deletingCategory || !deleteTarget || categoryPending) return;
    setCategoryPending(true);
    setDeleteError('');
    setCategoryMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/world-categories`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deletingCategory, targetName: deleteTarget }),
      });
      const result = await response.json() as { targetName: string; categories: WorldCategoryRecord[]; updatedEntries: number; updatedSuggestions: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? '카테고리를 삭제하지 못했습니다.');
      setLocalCategoryRecords(result.categories);
      setLocalEntries((current) => current.map((entry) => ({ ...entry, category: resolveWorldCategoryName(result.categories, entry.category) })));
      setSelectedEntry((current) => current ? { ...current, category: resolveWorldCategoryName(result.categories, current.category) } : null);
      handleCategoryFilter(result.targetName);
      setCategoryMessage(`“${deletingCategory}” 카테고리를 삭제했습니다. 기존 항목 ${result.updatedEntries}개와 검토 이력 ${result.updatedSuggestions}개는 “${result.targetName}”에 보존했습니다.`);
      setDeletingCategory(null);
      setIsCategoryFormOpen(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '카테고리를 삭제하지 못했습니다.');
    } finally { setCategoryPending(false); }
  };

  const openCategoryTraits = async () => {
    if (!activeCategory || categoryPending) return;
    setCategoryPending(true); setCategoryError('');
    try {
      let records = localCategoryRecords;
      let record = records.find((category) => resolveWorldCategoryName(records, activeCategory) === category.name);
      if (!record?.id) {
        const create = await fetch(`/api/projects/${projectId}/world-categories`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: activeCategory }),
        });
        if (!create.ok) throw new Error('카테고리 특성을 준비하지 못했습니다.');
        const response = await fetch(`/api/projects/${projectId}/world-categories`);
        if (!response.ok) throw new Error('카테고리 정보를 불러오지 못했습니다.');
        records = await response.json() as WorldCategoryRecord[];
        setLocalCategoryRecords(records);
        record = records.find((category) => resolveWorldCategoryName(records, activeCategory) === category.name);
      }
      if (!record?.id) throw new Error('카테고리 ID를 확인하지 못했습니다.');
      setTraitCategory(record); setTraitDraft(record.traits ?? []);
    } catch (error) { setCategoryError(error instanceof Error ? error.message : '카테고리 특성을 불러오지 못했습니다.'); }
    finally { setCategoryPending(false); }
  };

  const saveCategoryTraits = async () => {
    if (!traitCategory?.id || categoryPending) return;
    setCategoryPending(true); setCategoryError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/world-categories/${traitCategory.id}/traits`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ traits: traitDraft }),
      });
      const saved = await response.json() as WorldCategoryRecord & { error?: string };
      if (!response.ok) throw new Error(saved.error ?? '카테고리 특성을 저장하지 못했습니다.');
      setLocalCategoryRecords((current) => current.map((category) => category.id === saved.id ? saved : category));
      setCategoryMessage(`“${saved.name}” 카테고리 특성을 저장했습니다.`); setTraitCategory(null);
    } catch (error) { setCategoryError(error instanceof Error ? error.message : '카테고리 특성을 저장하지 못했습니다.'); }
    finally { setCategoryPending(false); }
  };

  return (
    <div className="space-y-7">
      <section className="muse-panel flex flex-col justify-between gap-5 px-6 py-7 sm:flex-row sm:items-end sm:px-8">
        <div>
          <p className="muse-eyebrow flex items-center gap-1.5">
            <Globe2 className="size-3.5" />
            World bible
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.03em]">세계관</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            장소와 역사, 규칙을 연결해 설득력 있는 세계를 만드세요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowSearch((v) => !v)}
            size="sm"
            type="button"
            variant={showSearch ? 'secondary' : 'outline'}
          >
            <Search />
            검색
          </Button>
          <Dialog onOpenChange={setIsCreateOpen} open={isCreateOpen}>
            <DialogTrigger asChild>
              <Button size="lg"><Plus />새 항목</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>새 항목</DialogTitle>
                <DialogDescription>
                  세계관의 새로운 항목을 추가하세요
                </DialogDescription>
              </DialogHeader>
              <WorldEntryForm
                categoryOptions={categories}
                initialCategory={activeCategory ?? ''}
                onSuccess={(entry) => {
                  mergeEntries([entry]);
                  handleCategoryFilter(entry.category);
                  setIsCreateOpen(false);
                }}
                projectId={projectId}
              />
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <WorldBuilderAssistant
        categoryRecords={localCategoryRecords}
        key={projectId}
        onEntriesAdded={(approved) => {
          mergeEntries(approved);
          handleCategoryFilter(null);
        }}
        projectId={projectId}
      />

      {showSearch && (
        <WorldSearch
          entries={liveEntries}
          onSelectEntry={(entryId) => {
            const found = liveEntries.find((entry) => entry.id === entryId);
            if (found) setSelectedEntry(found);
            setShowSearch(false);
          }}
        />
      )}

      {/* Category filter pills */}
      {categories.length > 0 && (
        <div className="muse-panel flex flex-wrap gap-1.5 p-2">
          <button
            aria-pressed={!activeCategory && !activeTag}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !activeCategory && !activeTag
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
            onClick={() => handleCategoryFilter(null)}
            type="button"
          >
            전체
          </button>
          {categories.map((cat) => (
            <button
              aria-pressed={activeCategory === cat}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              key={cat}
              onClick={() => handleCategoryFilter(cat)}
              type="button"
            >
              {cat}
            </button>
          ))}
          <Button
            aria-expanded={isCategoryFormOpen}
            disabled={categoryPending}
            onClick={() => { setRenamingCategory(null); setCategoryName(''); setIsCategoryFormOpen(true); setCategoryError(''); }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Plus />카테고리 추가
          </Button>
          {activeCategory && <Button disabled={categoryPending} onClick={() => {
            setRenamingCategory(activeCategory); setCategoryName(activeCategory); setCategoryError(''); setIsCategoryFormOpen(true);
          }} size="sm" type="button" variant="ghost"><Pencil />카테고리 이름 변경</Button>}
          {activeCategory && <Button disabled={categoryPending} onClick={() => void openCategoryTraits()} size="sm" type="button" variant="ghost">카테고리 특성</Button>}
          {activeCategory && <Button disabled={categoryPending} onClick={() => {
            setDeletingCategory(activeCategory); setDeleteError('');
            const choices = categories.filter((name) => name !== activeCategory);
            setDeleteTarget(choices.includes('기타') ? '기타' : choices[0] ?? '');
          }} size="sm" type="button" variant="ghost"><Trash2 />카테고리 삭제</Button>}
        </div>
      )}

      <Dialog onOpenChange={(open) => { if (!open && !categoryPending) setDeletingCategory(null); }} open={deletingCategory !== null}>
        <DialogContent showCloseButton={!categoryPending}>
          <DialogHeader>
            <DialogTitle>카테고리 삭제 확인</DialogTitle>
            <DialogDescription>“{deletingCategory}” 분류만 삭제합니다. 소속 항목의 내용·태그·연결과 AI 검토 상태는 유지됩니다.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleDeleteCategory}>
            <p className="text-sm">현재 목록의 항목 {liveEntries.filter((entry) => entry.category === deletingCategory).length}개와 서버의 해당 검토 후보·이력을 아래 분류로 이동합니다.</p>
            <label className="block space-y-2 text-sm">
              <span>항목을 이동할 카테고리</span>
              <select className="w-full rounded-lg border border-input bg-card p-2" disabled={categoryPending} onChange={(event) => setDeleteTarget(event.target.value)} required value={deleteTarget}>
                <option disabled value="">카테고리를 선택하세요</option>
                {categories.filter((name) => name !== deletingCategory).map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">삭제 후 이전 이름으로 저장되는 항목도 선택한 분류에 연결됩니다. 카테고리는 최소 하나를 남겨야 합니다.</p>
            {deleteError && <p className="text-sm text-destructive" role="alert">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <Button disabled={categoryPending} onClick={() => setDeletingCategory(null)} type="button" variant="outline">취소</Button>
              <Button disabled={categoryPending || !deleteTarget} type="submit" variant="destructive">{categoryPending ? '처리 중...' : '항목 보존 후 삭제'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {isCategoryFormOpen && (
        <form className="muse-panel space-y-3 p-4" onSubmit={handleCreateCategory}>
          <label className="text-sm font-medium" htmlFor="new-world-category">{renamingCategory ? '변경할 카테고리 이름' : '새 카테고리 이름'}</label>
          <div className="flex flex-wrap gap-2">
            <Input
              autoFocus
              className="max-w-sm"
              disabled={categoryPending}
              id="new-world-category"
              maxLength={50}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="예: 영약, 무기, 종파, 수련 경지"
              required
              value={categoryName}
            />
            <Button disabled={categoryPending || !categoryName.trim()} type="submit">
              {categoryPending ? '저장 중...' : renamingCategory ? '이름 변경 저장' : '카테고리 저장'}
            </Button>
            <Button disabled={categoryPending} onClick={() => setIsCategoryFormOpen(false)} type="button" variant="outline">취소</Button>
          </div>
          <p className="text-xs text-muted-foreground">{renamingCategory ? `“${renamingCategory}”의 기존 항목과 AI 검토 후보에 함께 적용합니다. 내용은 변경하지 않습니다.` : '이 작품에 저장되며, 항목이 없어도 탭과 새 항목의 분류 선택에 표시됩니다.'}</p>
          {categoryError && <p className="text-sm text-destructive" role="alert">{categoryError}</p>}
        </form>
      )}

      {traitCategory && <section className="muse-panel space-y-3 p-4">
        <div><h2 className="font-semibold">“{traitCategory.name}” 카테고리 특성</h2><p className="mt-1 text-xs text-muted-foreground">항목 태그와 별개이며 소속 선택과 회차별 표시 그룹에 사용됩니다.</p></div>
        <div className="flex flex-wrap gap-3">{(Object.keys(CATEGORY_TRAIT_LABELS) as WorldCategoryTrait[]).map((trait) => <label className="flex items-center gap-2 text-sm" key={trait}><input checked={traitDraft.includes(trait)} disabled={categoryPending} onChange={(event) => setTraitDraft((current) => event.target.checked ? [...current, trait] : current.filter((value) => value !== trait))} type="checkbox" />{CATEGORY_TRAIT_LABELS[trait]}</label>)}</div>
        <div className="flex gap-2"><Button disabled={categoryPending} onClick={() => void saveCategoryTraits()} size="sm" type="button">특성 저장</Button><Button disabled={categoryPending} onClick={() => setTraitCategory(null)} size="sm" type="button" variant="outline">취소</Button></div>
      </section>}

      {categoryMessage && <p className="text-sm text-muted-foreground" role="status">{categoryMessage}</p>}

      {/* Active tag indicator */}
      {activeTag && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">태그 필터:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-foreground bg-foreground px-2.5 py-0.5 text-xs font-medium text-background">
            {activeTag}
            <button
              className="ml-0.5 rounded-full p-0.5 hover:bg-background/20"
              onClick={() => {
                setActiveTag(null);
              }}
              type="button"
            >
              <svg className="size-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {displayEntries.length === 0 ? (
        <div className="muse-empty">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-border bg-card text-primary shadow-sm">
            <Globe2 className="size-6" strokeWidth={1.6} />
          </span>
          <p className="mt-5 font-heading text-xl font-semibold">
            항목이 없습니다
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {activeCategory === '물건'
              ? '영약·무기·유물 같은 물건을 새 항목으로 등록해 보세요.'
              : activeCategory === '기타'
                ? '다른 분류에 넣기 어려운 설정이나 참고 정보를 기록해 보세요.'
                : '이야기의 첫 장소나 규칙을 기록해 보세요.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedEntries)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cat, catEntries]) => (
              <div key={cat}>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[cat] ?? DEFAULT_CATEGORY_COLOR}`}
                  >
                    {cat}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {catEntries.length === categoryTotals.get(cat)
                      ? `${catEntries.length}개`
                      : `${catEntries.length}/${categoryTotals.get(cat) ?? catEntries.length}개`}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {catEntries.map((entry) => (
                    <EntryCard
                      entry={entry}
                      key={entry.id}
                      onSelect={() => setSelectedEntry(entry)}
                      onTagClick={handleTagClick}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      <ProgressiveListControls
        onLoadMore={() =>
          setVisibleEntryCount((current) =>
            nextProgressiveCount(current, displayEntries.length)
          )
        }
        shown={renderedEntries.length}
        total={displayEntries.length}
      />

      {selectedEntry && (
        <EntryDetailDialog
          categoryOptions={categories}
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onDeleted={(id) => {
            setDeletedIds((prev) => new Set([...prev, id]));
            setLocalEntries((currentEntries) =>
              currentEntries.filter((entry) => entry.id !== id)
            );
          }}
          onEntryChange={(entry) => {
            mergeEntries([entry]);
            setSelectedEntry(entry);
          }}
          projectId={projectId}
        />
      )}
    </div>
  );
}

function EntryCard({
  entry,
  onSelect,
  onTagClick,
}: {
  entry: WorldEntry;
  onSelect: () => void;
  onTagClick: (tag: string) => void;
}) {
  const tags = entry.tags ?? [];

  return (
    <button
      className="muse-card muse-render-lazy group relative min-h-48 overflow-hidden p-5 text-left"
      onClick={onSelect}
      type="button"
    >
      <h2 className="pr-8 font-heading text-lg font-semibold tracking-[-0.02em] text-card-foreground">
        {entry.title}
      </h2>
      {entry.content && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {splitResearchContent(entry.content).content}
        </p>
      )}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              className="inline-block cursor-pointer rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-muted"
              key={t.id}
              onClick={(e) => {
                e.stopPropagation();
                onTagClick(t.tag);
              }}
            >
              {t.tag}
            </span>
          ))}
        </div>
      )}
      <ArrowUpRight className="absolute top-5 right-5 size-4 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

function EntryDetailDialog({
  categoryOptions,
  projectId,
  entry,
  onClose,
  onDeleted,
  onEntryChange,
}: {
  categoryOptions: string[];
  projectId: string;
  entry: WorldEntry;
  onClose: () => void;
  onDeleted?: (id: string) => void;
  onEntryChange?: (entry: WorldEntry) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<WorldEntry>(entry);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <AdaptiveDetailDialogContent
        editing={isEditing}
        sizingContent={[currentEntry.title, splitResearchContent(currentEntry.content).content]}
      >
        {isEditing ? (
          <>
            <DialogHeader>
              <DialogTitle>항목 수정</DialogTitle>
              <DialogDescription>
                세계관 항목을 수정하세요
              </DialogDescription>
            </DialogHeader>
            <WorldEntryForm
              categoryOptions={categoryOptions}
              entry={currentEntry}
              onSuccess={(updatedEntry) => {
                setCurrentEntry(updatedEntry);
                onEntryChange?.(updatedEntry);
                setIsEditing(false);
              }}
              projectId={projectId}
            />
            <div className="flex justify-start">
              <Button
                onClick={() => setIsEditing(false)}
                type="button"
                variant="outline"
              >
                취소
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{currentEntry.title}</DialogTitle>
            </DialogHeader>
            <EntityRevisionPanel entityId={currentEntry.id} key={currentEntry.id} kind="world" onSaved={(updated) => {
              const next = { ...currentEntry, ...updated } as WorldEntry;
              setCurrentEntry(next); onEntryChange?.(next);
            }} projectId={projectId} />
            <WorldEntryDetail
              entry={currentEntry}
              onClose={onClose}
              onDeleted={onDeleted}
              onEdit={() => setIsEditing(true)}
              onTagsChange={(tags) => {
                const updatedEntry = { ...currentEntry, tags };
                setCurrentEntry(updatedEntry);
                onEntryChange?.(updatedEntry);
              }}
              projectId={projectId}
            />
          </>
        )}
      </AdaptiveDetailDialogContent>
    </Dialog>
  );
}
