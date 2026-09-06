import type { StoryPlanningDraft } from './story-planning-types';

export type WritingBlueprint = {
  authorNote?: string;
  contentBoundaries?: string;
  endingDirection?: string;
  formatGoal?: string;
  narrativeTense?: string;
  pointOfView?: string;
  storyPromise?: string;
  targetAudience?: string;
  tone?: string;
  writingStyle?: string;
};

type ProjectSettings = Record<string, unknown> & {
  writingBlueprint?: WritingBlueprint;
};

function cleanText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeBlueprint(value: unknown): WritingBlueprint {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};

  return {
    authorNote: cleanText(source.authorNote),
    contentBoundaries: cleanText(source.contentBoundaries),
    endingDirection: cleanText(source.endingDirection),
    formatGoal: cleanText(source.formatGoal),
    narrativeTense: cleanText(source.narrativeTense),
    pointOfView: cleanText(source.pointOfView),
    storyPromise: cleanText(source.storyPromise),
    targetAudience: cleanText(source.targetAudience),
    tone: cleanText(source.tone),
    writingStyle: cleanText(source.writingStyle),
  };
}

function parseSettings(settingsJson: string | null | undefined): ProjectSettings {
  if (!settingsJson) return {};

  try {
    const parsed = JSON.parse(settingsJson) as unknown;
    return parsed && typeof parsed === 'object'
      ? parsed as ProjectSettings
      : {};
  } catch {
    return {};
  }
}

export function getWritingBlueprint(
  settingsJson: string | null | undefined
): WritingBlueprint {
  const settings = parseSettings(settingsJson);
  return normalizeBlueprint(settings.writingBlueprint);
}

export function getInitialStoryIdea(
  settingsJson: string | null | undefined
) {
  const settings = parseSettings(settingsJson);
  const snapshot = settings.ideationSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  return cleanText((snapshot as Record<string, unknown>).brainDump);
}

export function buildWritingBlueprintFromDraft(
  draft: StoryPlanningDraft
): WritingBlueprint {
  return normalizeBlueprint({
    authorNote: draft.authorNote,
    contentBoundaries: draft.contentBoundaries,
    endingDirection: draft.endingDirection,
    formatGoal: draft.formatGoal,
    narrativeTense: draft.narrativeTense,
    pointOfView: draft.pointOfView,
    storyPromise: draft.storyPromise,
    targetAudience: draft.targetAudience,
    tone: draft.tone,
    writingStyle: draft.writingStyle,
  });
}

export function updateWritingBlueprintSettings(
  settingsJson: string | null | undefined,
  updates: WritingBlueprint
) {
  const settings = parseSettings(settingsJson);
  const current = normalizeBlueprint(settings.writingBlueprint);

  return JSON.stringify({
    ...settings,
    writingBlueprint: normalizeBlueprint({ ...current, ...updates }),
  });
}
