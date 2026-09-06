'use client';

import { ChevronDown, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ChapterReferenceGroup } from '@/lib/chapter-references';

type Affiliation = { organizationTitle: string; position: string | null; isPrimary: number };
type Reference = { id?: string; characterId: string | null; worldEntryId: string | null; title: string; category: string | null;
  group: ChapterReferenceGroup; presence: 'appears' | 'mentioned'; displayGroupOverride: ChapterReferenceGroup | null;
  note: string | null; sortOrder: number; affiliations?: Affiliation[];
};
type Data = { revision: number; references: Reference[]; options: {
  characters: Array<{ id: string; name: string; group: 'character' }>;
  worldEntries: Array<{ id: string; title: string; category: string; group: ChapterReferenceGroup; groups?: ChapterReferenceGroup[] }>;
} };
const GROUPS: [ChapterReferenceGroup, string][] = [['character', '인물'], ['location', '장소·지형'], ['item', '물건'], ['organization', '단체'], ['other', '기타']];

export function ChapterReferenceBar({ projectId, chapterId }: { projectId: string; chapterId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Reference[]>([]);
  const [openGroup, setOpenGroup] = useState<ChapterReferenceGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const endpoint = `/api/projects/${projectId}/chapters/${chapterId}/references`;
  useEffect(() => {
    const controller = new AbortController(); setData(null); setDraft([]); setError(''); setOpenGroup(null);
    fetch(endpoint, { signal: controller.signal }).then(async (response) => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? '등장 항목을 불러오지 못했습니다.');
      setData(result); setDraft(result.references);
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [endpoint]);
  const dirty = Boolean(data && JSON.stringify(draft.map(({ id: _id, title: _title, category: _category, group: _group, affiliations: _affiliations, ...entry }) => entry)) !== JSON.stringify(data.references.map(({ id: _id, title: _title, category: _category, group: _group, affiliations: _affiliations, ...entry }) => entry)));
  const add = (group: ChapterReferenceGroup, value: string) => {
    if (!data || !value) return;
    if (group === 'character') {
      const option = data.options.characters.find((entry) => entry.id === value);
      if (!option || draft.some((entry) => entry.characterId === value)) return;
      setDraft((current) => [...current, { characterId: value, worldEntryId: null, title: option.name, category: null, group, presence: 'appears', displayGroupOverride: null, note: null, sortOrder: current.length }]);
      return;
    }
    const option = data.options.worldEntries.find((entry) => entry.id === value);
    if (!option || draft.some((entry) => entry.worldEntryId === value)) return;
    setDraft((current) => [...current, { characterId: null, worldEntryId: value, title: option.title, category: option.category,
      group, presence: 'appears', displayGroupOverride: option.group === group ? null : group, note: null, sortOrder: current.length,
    }]);
  };
  const save = async () => {
    if (!data || busy || !dirty) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        expectedRevision: data.revision,
        references: draft.map((entry, index) => ({ characterId: entry.characterId, worldEntryId: entry.worldEntryId,
          presence: entry.presence, displayGroupOverride: entry.displayGroupOverride, note: entry.note, sortOrder: index,
        })),
      }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? '등장 항목을 저장하지 못했습니다.');
      setData(result); setDraft(result.references); setMessage('이번 화 등장 항목을 저장했습니다.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '등장 항목을 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  return <section className="border-b border-border/60 bg-background/55 px-5 py-2.5 sm:px-7">
    <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs font-medium text-muted-foreground">이번 화</span>{GROUPS.map(([group, label]) => {
      const rows = draft.filter((entry) => entry.group === group);
      const options = group === 'character' ? data?.options.characters.map((entry) => ({ id: entry.id, title: entry.name })) ?? []
        : data?.options.worldEntries.filter((entry) => (entry.groups ?? [entry.group]).includes(group)).map((entry) => ({ id: entry.id, title: entry.title })) ?? [];
      return <Popover key={group} onOpenChange={(open) => setOpenGroup(open ? group : null)} open={openGroup === group}><PopoverTrigger asChild><Button disabled={!data} size="sm" type="button" variant="outline">{label} {rows.length}<ChevronDown /></Button></PopoverTrigger><PopoverContent align="start" className="w-72 space-y-2 p-3" side="bottom">
        <select aria-label={`${label} 추가`} className="w-full rounded-lg border border-input bg-background p-2 text-sm" defaultValue="" onChange={(event) => { add(group, event.target.value); event.target.value = ''; }}><option value="">항목 검색·선택</option>{options.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select>
        {rows.length === 0 ? <p className="text-xs text-muted-foreground">등록된 항목이 없습니다.</p> : rows.map((entry) => <div className="rounded-lg border border-border p-2" key={entry.characterId ?? entry.worldEntryId}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{entry.title}</p>{entry.affiliations?.length ? <p className="text-xs text-muted-foreground">{entry.affiliations.map((affiliation) => `${affiliation.organizationTitle}${affiliation.position ? ` · ${affiliation.position}` : ''}`).join(', ')}</p> : null}</div><button aria-label={`${entry.title} 연결 해제`} className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => setDraft((current) => current.filter((item) => item !== entry))} type="button"><X className="size-3.5" /></button></div><select aria-label={`${entry.title} 등장 방식`} className="mt-2 w-full rounded border border-input bg-background p-1 text-xs" onChange={(event) => setDraft((current) => current.map((item) => item === entry ? { ...item, presence: event.target.value as Reference['presence'] } : item))} value={entry.presence}><option value="appears">직접 등장</option><option value="mentioned">언급만</option></select><input aria-label={`${entry.title} 회차 메모`} className="mt-2 w-full rounded border border-input bg-background p-1.5 text-xs" maxLength={1000} onChange={(event) => setDraft((current) => current.map((item) => item === entry ? { ...item, note: event.target.value || null } : item))} placeholder="이번 화에서의 역할·상태 메모" value={entry.note ?? ''} /></div>)}
      </PopoverContent></Popover>;
    })}<Button disabled={!dirty || busy} onClick={() => void save()} size="sm" type="button"><Save />{busy ? '저장 중' : '연결 저장'}</Button>{dirty && <span className="text-xs text-amber-700 dark:text-amber-300">저장하지 않은 변경</span>}</div>
    {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}{message && <p className="mt-2 text-xs text-muted-foreground" role="status">{message}</p>}
  </section>;
}
