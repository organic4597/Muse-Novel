export const SELECTION_REWRITE_PROMPTS = {
  fixSpelling: {
    default:
      'Fix spelling and grammar. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: 'Fix spelling and grammar.',
    selecting:
      'Fix spelling and grammar for the selected text. Preserve the original language and writing system. Do not translate. Return only the rewritten selection text as plain text without quotes, markdown, bullets, labels, or explanations.',
  },
  improveWriting: {
    default:
      'Improve the writing. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: 'Improve the writing.',
    selecting:
      'Improve the selected text. Preserve the original language and writing system. Do not translate. Keep the tone and meaning unless the user asked otherwise. Return only the rewritten selection text as plain text without quotes, markdown, bullets, labels, or explanations.',
  },
  makeLonger: {
    default:
      'Make the text longer while preserving meaning. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: 'Make the selected text longer while preserving meaning.',
    selecting:
      'Make the selected text longer while preserving meaning. Preserve the original language and writing system. Do not translate. Return only the rewritten selection text as plain text without quotes, markdown, bullets, labels, or explanations.',
  },
  makeShorter: {
    default:
      'Make the text shorter while preserving meaning. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: 'Make the selected text shorter while preserving meaning.',
    selecting:
      'Make the selected text shorter while preserving meaning. Preserve the original language and writing system. Do not translate. Return only the rewritten selection text as plain text without quotes, markdown, bullets, labels, or explanations.',
  },
  simplifyLanguage: {
    default:
      'Simplify the language. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: 'Simplify the selected text.',
    selecting:
      'Simplify the selected text. Preserve the original language and writing system. Do not translate. Return only the rewritten selection text as plain text without quotes, markdown, bullets, labels, or explanations.',
  },
} as const;

export type SelectionRewritePromptConfig =
  (typeof SELECTION_REWRITE_PROMPTS)[keyof typeof SELECTION_REWRITE_PROMPTS];

export function getSelectionRewritePromptConfig(
  key: keyof typeof SELECTION_REWRITE_PROMPTS
): Pick<SelectionRewritePromptConfig, 'default' | 'selecting'> {
  const prompt = SELECTION_REWRITE_PROMPTS[key];

  return {
    default: prompt.default,
    selecting: prompt.selecting,
  };
}

export function resolveSelectionRewriteInstruction(input: string): string | null {
  const normalizedInput = input.trim();

  for (const prompt of Object.values(SELECTION_REWRITE_PROMPTS)) {
    if (
      normalizedInput === prompt.default ||
      normalizedInput === prompt.selecting
    ) {
      return prompt.instruction;
    }
  }

  return null;
}
