import type { WebResearch } from '@/lib/web-research/types';
import type { WorldBatchReport } from '@/lib/ai/world-request';

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
