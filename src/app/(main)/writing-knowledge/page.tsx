import { BookOpenCheck, Search } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  getWritingKnowledgeDocument,
  loadWritingKnowledge,
  searchWritingKnowledge,
} from '@/lib/knowledge/writing-knowledge';

export const dynamic = 'force-dynamic';

function buildHref(options: { category?: string; doc?: string; q?: string }) {
  const params = new URLSearchParams();
  if (options.q) params.set('q', options.q);
  if (options.category) params.set('category', options.category);
  if (options.doc) params.set('doc', options.doc);
  const query = params.toString();
  return query ? `/writing-knowledge?${query}` : '/writing-knowledge';
}

export default async function WritingKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.slice(0, 500) : '';
  const category = typeof params.category === 'string'
    ? params.category.slice(0, 100)
    : '';
  const requestedDocument = typeof params.doc === 'string' ? params.doc : '';
  const allDocuments = loadWritingKnowledge();
  const documents = searchWritingKnowledge(q, {
    category: category || undefined,
    limit: 50,
  });
  const selectedDocument = (
    requestedDocument ? getWritingKnowledgeDocument(requestedDocument) : undefined
  ) ?? documents[0];
  const categories = Array.from(
    new Set(allDocuments.map((document) => document.category))
  ).sort((a, b) => a.localeCompare(b, 'ko'));

  return (
    <div className="space-y-6">
      <section className="muse-panel px-6 py-7 sm:px-9">
        <p className="muse-eyebrow flex items-center gap-2">
          <BookOpenCheck className="size-3.5" />
          Writing knowledge
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.035em]">
          창작 위키
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          소설 기획과 집필, 퇴고 방법을 사람이 읽고 AI도 검색해 활용하는 지식 베이스입니다.
          Markdown 문서를 디렉터리에 추가하면 자동으로 확장됩니다.
        </p>
        <form className="mt-6 flex max-w-2xl gap-2" method="get">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              defaultValue={q}
              name="q"
              placeholder="예: 대사 긴장감, 3인칭 제한, 결말 복선"
            />
          </label>
          {category && <input name="category" type="hidden" value={category} />}
          <button className="rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground" type="submit">
            검색
          </button>
        </form>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${category ? 'border-border bg-card text-muted-foreground' : 'border-primary bg-primary text-primary-foreground'}`}
          href={buildHref({ q })}
        >
          전체 {allDocuments.length}
        </Link>
        {categories.map((item) => (
          <Link
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${category === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent'}`}
            href={buildHref({ category: item, q })}
            key={item}
          >
            {item}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="muse-panel max-h-[calc(100vh-10rem)] overflow-y-auto p-3">
          <p className="px-2 py-2 text-xs font-medium text-muted-foreground">
            {documents.length}개 문서
          </p>
          <div className="space-y-1">
            {documents.map((document) => (
              <Link
                className={`block rounded-xl px-3 py-3 transition-colors ${selectedDocument?.id === document.id ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                href={buildHref({ category, doc: document.id, q })}
                key={document.id}
              >
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
                  {document.category}
                </span>
                <span className="mt-1 block text-sm font-semibold">{document.title}</span>
                <span className="mt-1 line-clamp-2 block text-xs leading-5">
                  {document.summary}
                </span>
              </Link>
            ))}
            {documents.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                검색 결과가 없습니다.
              </p>
            )}
          </div>
        </aside>

        <article className="muse-panel min-w-0 p-6 sm:p-8">
          {selectedDocument ? (
            <>
              <div className="border-b border-border/70 pb-5">
                <p className="muse-eyebrow">{selectedDocument.category}</p>
                <h2 className="mt-2 font-heading text-2xl font-semibold">
                  {selectedDocument.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selectedDocument.summary}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedDocument.tags.map((tag) => (
                    <span className="rounded-full bg-muted px-2 py-1 text-[0.68rem] text-muted-foreground" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                {(selectedDocument.kind || selectedDocument.genres?.length || selectedDocument.license) && (
                  <dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    {selectedDocument.kind && (
                      <div><dt className="font-semibold text-foreground/70">유형</dt><dd>{selectedDocument.kind}</dd></div>
                    )}
                    {selectedDocument.genres && selectedDocument.genres.length > 0 && (
                      <div><dt className="font-semibold text-foreground/70">장르</dt><dd>{selectedDocument.genres.join(', ')}</dd></div>
                    )}
                    {selectedDocument.license && (
                      <div><dt className="font-semibold text-foreground/70">라이선스</dt><dd>{selectedDocument.license}</dd></div>
                    )}
                  </dl>
                )}
                {selectedDocument.sourceUrl && (
                  <a
                    className="mt-3 inline-flex text-xs font-medium text-primary underline underline-offset-4"
                    href={selectedDocument.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    원본 출처 열기
                  </a>
                )}
              </div>
              <div className="prose prose-sm mt-6 max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-p:leading-7 prose-li:leading-7 dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedDocument.content}
                </ReactMarkdown>
              </div>
            </>
          ) : (
            <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
              왼쪽에서 문서를 선택하세요.
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
