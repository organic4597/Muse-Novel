/** Types for the story planning (스토리 구상) feature */

export type StoryPlanningPhase =
  | 'genre_tone'
  | 'premise'
  | 'themes'
  | 'characters'
  | 'world'
  | 'plot'
  | 'writing_style'
  | 'first_chapter'
  | 'complete';

export const PHASE_LABELS: Record<StoryPlanningPhase, string> = {
  genre_tone: '장르/분위기',
  premise: '전제/시놉시스',
  themes: '주제',
  characters: '등장인물',
  world: '세계관',
  plot: '플롯/타임라인',
  writing_style: '시점/문체/분량',
  first_chapter: '첫 챕터',
  complete: '완성',
};

export const PHASE_ORDER: StoryPlanningPhase[] = [
  'genre_tone',
  'premise',
  'themes',
  'characters',
  'world',
  'plot',
  'writing_style',
  'first_chapter',
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
  title?: string;
  genre?: string;
  synopsis?: string;
  premise?: string;
  tone?: string;
  themes?: string[];
  characters: StoryPlanningCharacter[];
  worldEntries: StoryPlanningWorldEntry[];
  firstChapterOutline?: string;
  pendingCharacters?: StoryPlanningCharacter[];
  pendingWorldEntries?: StoryPlanningWorldEntry[];
  currentPhase?: StoryPlanningPhase;
  pointOfView?: string;
  writingStyle?: string;
  formatGoal?: string;
  plotStructure?: string;
}

export interface StoryPlanningMessage {
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
