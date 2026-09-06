import type { WorldBatchReport } from '@/lib/ai/world-request';
import type { EntitySnapshot } from '@/lib/entity-revisions';
import type { WebResearch } from '@/lib/web-research/types';

export type WorldSuggestion = {
  id: string;
  projectId: string;
  batchId: string;
  title: string;
  category: string;
  content: string | null;
  tags: string[];
  research?: WebResearch;
  sourceIds?: string[];
  report?: WorldBatchReport;
  status: 'pending' | 'approved' | 'rejected';
  approvedEntryId: string | null;
  createdAt: Date | string | null;
};

export type WorldEditSuggestion = {
  entryId: string;
  title: string;
  before: EntitySnapshot;
  changes: EntitySnapshot;
  baseVersion: string;
  note: string;
  research?: WebResearch;
};
