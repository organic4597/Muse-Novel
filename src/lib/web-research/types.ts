export const WEB_SEARCH_MODES = ['auto', 'always', 'off'] as const;
export type WebSearchMode = (typeof WEB_SEARCH_MODES)[number];

export type WebSource = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  sourceName?: string;
  sourceKind?: string;
};

export type WebResearch = {
  status: 'skipped' | 'searched' | 'unavailable';
  queries: string[];
  sources: WebSource[];
  warning?: string;
};
