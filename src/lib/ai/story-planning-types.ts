/** Types for the story planning (스토리 구상) feature */

export interface StoryPlanningCharacter {
  name: string;
  role?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  arcDescription?: string;
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
}

export interface StoryPlanningMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const EMPTY_DRAFT: StoryPlanningDraft = {
  characters: [],
  worldEntries: [],
};
