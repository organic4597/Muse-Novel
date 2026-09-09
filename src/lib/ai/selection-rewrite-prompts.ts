export const SELECTION_REWRITE_PROMPTS = {
  fixSpelling: {
    default:
      'Fix spelling and grammar. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: '맞춤법과 문법만 바로잡고 의미와 문체는 유지한다.',
    selecting:
      'Fix spelling and grammar for the selected text. Preserve the original language and writing system. Do not translate. Return only the rewritten selection text as plain text without quotes, markdown, bullets, labels, or explanations.',
  },
  improveWriting: {
    default:
      'Improve the writing. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: '의미와 시점을 유지하면서 더 자연스럽고 구체적인 소설 문장으로 다듬는다.',
    selecting:
      'Improve the selected text. Preserve the original language and writing system. Do not translate. Keep the tone and meaning unless the user asked otherwise. Return only the rewritten selection text as plain text without quotes, markdown, bullets, labels, or explanations.',
  },
  makeLonger: {
    default:
      'Make the text longer while preserving meaning. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: '핵심 의미를 유지하고 행동·감각·정황을 보태 자연스럽게 확장한다.',
    selecting:
      'Make the selected text longer while preserving meaning. Preserve the original language and writing system. Do not translate. Return only the rewritten selection text as plain text without quotes, markdown, bullets, labels, or explanations.',
  },
  makeShorter: {
    default:
      'Make the text shorter while preserving meaning. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: '핵심 의미와 필수 사실을 유지하면서 중복 표현을 덜어 간결하게 줄인다.',
    selecting:
      'Make the selected text shorter while preserving meaning. Preserve the original language and writing system. Do not translate. Return only the rewritten selection text as plain text without quotes, markdown, bullets, labels, or explanations.',
  },
  simplifyLanguage: {
    default:
      'Simplify the language. Preserve the original language and writing system. Return only the rewritten result as plain text.',
    instruction: '의미를 유지하면서 어휘와 문장 구조를 명확하고 쉽게 바꾼다.',
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

export function resolveSelectionRewriteRequest(input: string, isSelecting: boolean) {
  if (!isSelecting) return null;
  return resolveSelectionRewriteInstruction(input) ?? (input.trim().slice(0, 5000) || null);
}
