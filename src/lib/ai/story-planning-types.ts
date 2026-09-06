/** Types for the story planning (스토리 구상) feature */
import type { WebResearch } from '@/lib/web-research/types';

export type StoryPlanningPhase =
  | 'genre_tone'
  | 'premise'
  | 'characters'
  | 'world'
  | 'plot'
  | 'writing_setup'
  | 'complete';

export const PHASE_LABELS: Record<StoryPlanningPhase, string> = {
  genre_tone: '장르/분위기',
  premise: '전제/시놉시스/주제',
  characters: '등장인물',
  world: '세계관',
  plot: '플롯/첫 챕터',
  writing_setup: '집필 설정',
  complete: '완성',
};

export const PHASE_ORDER: StoryPlanningPhase[] = [
  'genre_tone',
  'premise',
  'characters',
  'world',
  'plot',
  'writing_setup',
  'complete',
];

export interface CharacterItem {
  name: string;
  description?: string;
  status?: string;
}

export interface StoryPlanningCharacter {
  name: string;
  role?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  arcDescription?: string;
  items?: CharacterItem[];
}

export interface StoryPlanningWorldEntry {
  category: string;
  title: string;
  content?: string;
}

export interface StoryPlanningDraft {
  brainDump?: string;
  title?: string;
  genre?: string;
  synopsis?: string;
  premise?: string;
  storyPromise?: string;
  tone?: string;
  themes?: string[];
  characters: StoryPlanningCharacter[];
  worldEntries: StoryPlanningWorldEntry[];
  firstChapterOutline?: string;
  endingDirection?: string;
  pendingCharacters?: StoryPlanningCharacter[];
  pendingWorldEntries?: StoryPlanningWorldEntry[];
  currentPhase?: StoryPlanningPhase;
  pointOfView?: string;
  narrativeTense?: string;
  writingStyle?: string;
  formatGoal?: string;
  targetAudience?: string;
  contentBoundaries?: string;
  authorNote?: string;
  plotStructure?: string;
}

export interface StoryPlanningMessage {
  research?: WebResearch;
  role: 'user' | 'assistant';
  content: string;
  options?: string[];
  draftSnapshot?: StoryPlanningDraft;
}

export const EMPTY_DRAFT: StoryPlanningDraft = {
  characters: [],
  worldEntries: [],
  currentPhase: 'genre_tone',
};
