import { getMarkdown } from '@platejs/ai';
import dedent from 'dedent';
import type { SlateEditor } from 'platejs';
import type { ChatMessage } from '@/components/editor/use-chat';

import {
  addSelection,
  buildStructuredPrompt,
  formatTextFromMessages,
  getMarkdownWithSelection,
  getSurroundingContext,
  isMultiBlocks,
} from './utils';

function stripSelectionTags(text: string): string {
  return text.replaceAll('<Selection>', '').replaceAll('</Selection>', '');
}

export function getChooseToolPrompt({ messages }: { messages: ChatMessage[] }) {
  return buildStructuredPrompt({
    examples: [
      // GENERATE
      'User: "Write a paragraph about AI ethics" → Good: "generate" | Bad: "edit"',
      'User: "Create a short poem about spring" → Good: "generate" | Bad: "edit"',

      // EDIT
      'User: "Please fix grammar." → Good: "edit" | Bad: "generate"',
      'User: "Improving writing style." → Good: "edit" | Bad: "generate"',
      'User: "Making it more concise." → Good: "edit" | Bad: "generate"',
      'User: "Translate this paragraph into French" → Good: "edit" | Bad: "generate"',
    ],
    history: formatTextFromMessages(messages),
    rules: dedent`
      - Default is "generate". Any open question, idea request, or creation request → "generate".
      - Only return "edit" if the user provides original text (or a selection of text) AND asks to change, rephrase, translate, or shorten it.
      - Return only one enum value with no explanation.
    `,
    task: `You are a strict classifier. Classify the user's last request as "generate" or "edit".`,
  });
}


export function getGeneratePrompt(
  editor: SlateEditor,
  {
    messages,
    rewriteInstruction,
  }: { messages: ChatMessage[]; rewriteInstruction?: string | null }
) {
  if (!isMultiBlocks(editor)) {
    addSelection(editor);
  }

  const selectingMarkdown = getMarkdownWithSelection(editor);

  if (rewriteInstruction) {
    const { before, after } = getSurroundingContext(editor);

    const contextualBackground = [
      before && `...(preceding context)\n${before}`,
      stripSelectionTags(selectingMarkdown),
      after && `${after}\n...(following context)`,
    ]
      .filter(Boolean)
      .join('\n\n');

    return buildStructuredPrompt({
      backgroundData: contextualBackground,
      history: formatTextFromMessages(messages),
      rules: dedent`
        - Preserve the original language and writing system.
        - Do not translate unless the user explicitly asked for translation.
        - Return only the final rewritten text as plain text.
        - Do not include <Selection> tags, XML tags, markdown fences, labels, bullets, examples, or explanations.
        - The rewritten text must flow naturally with the surrounding context shown above.
        - Output only the replacement for the originally selected portion, not the surrounding context.
      `,
      task: dedent`
        Rewrite the user's selected text according to this instruction: ${rewriteInstruction}
        Output only the clean rewritten replacement text that connects naturally with the surrounding paragraphs.
      `,
    });
  }

  return buildStructuredPrompt({
    backgroundData: selectingMarkdown,
    examples: [
      // 1) Summarize content
      'User: Summarize the following text.\nBackground data:\nArtificial intelligence has transformed multiple industries, from healthcare to finance, improving efficiency and enabling data-driven decisions.\nOutput:\nAI improves efficiency and decision-making across many industries.',

      // 2) Generate key takeaways
      'User: List three key takeaways from this text.\nBackground data:\nRemote work increases flexibility but also requires better communication and time management.\nOutput:\n- Remote work enhances flexibility.\n- Communication becomes critical.\n- Time management determines success.',

      // 3) Generate a title
      'User: Generate a short, catchy title for this section.\nBackground data:\nThis section explains how machine learning models are trained using large datasets to recognize patterns.\nOutput:\nTraining Machines to Recognize Patterns',

      // 4) Generate action items
      'User: Generate actionable next steps based on the paragraph.\nBackground data:\nThe report suggests improving documentation and conducting user interviews before the next release.\nOutput:\n- Update all technical documentation.\n- Schedule user interviews before the next release.',

      // 5) Generate a comparison table
      'User: Generate a comparison table of the tools mentioned.\nBackground data:\nTool A: free, simple UI\nTool B: paid, advanced analytics\nOutput:\n| Tool  | Pricing | Features         |\n|-------|----------|-----------------|\n| A     | Free     | Simple UI        |\n| B     | Paid     | Advanced analytics |',

      // 6) Generate a summary table of statistics
      'User: Create a summary table of the following statistics.\nBackground data:\nSales Q1: 1200 units\nSales Q2: 1500 units\nSales Q3: 900 units\nOutput:\n| Quarter | Sales (units) |\n|----------|---------------|\n| Q1       | 1200          |\n| Q2       | 1500          |\n| Q3       | 900           |',

      // 7) Generate a question list
      'User: Generate three reflection questions based on the paragraph.\nBackground data:\nThe article discusses the role of creativity in problem-solving and how diverse perspectives enhance innovation.\nOutput:\n1. How can creativity be encouraged in structured environments?\n2. What role does diversity play in innovative teams?\n3. How can leaders balance creativity and efficiency?',

      // 8) Explain a concept (selected phrase)
      'User: Explain the meaning of the selected phrase.\nBackground data:\nDeep learning relies on neural networks to automatically extract patterns from data, a process called <Selection>feature learning</Selection>.\nOutput:\n"Feature learning" means automatically discovering useful representations or characteristics from raw data without manual intervention.',
    ],
    history: formatTextFromMessages(messages),
    rules: dedent`
      - <Selection> is the text highlighted by the user.
      - backgroundData represents the user's current Markdown context.
      - You may only use backgroundData and <Selection> as input; never ask for more data.
      - CRITICAL: DO NOT remove or alter custom MDX tags such as <u>, <callout>, <kbd>, <toc>, <sub>, <sup>, <mark>, <del>, <date>, <span>, <column>, <column_group>, <file>, <audio>, <video> unless explicitly requested.
      - CRITICAL: when writing Markdown or MDX, do NOT wrap output in code fences.
      - Preserve indentation and line breaks when editing within columns or structured layouts.
    `,
    task: dedent`
      You are an advanced content generation assistant.
      Generate content based on the user's instructions, using the background data as context.
      If the instruction requests creation or transformation (e.g., summarize, translate, rewrite, create a table), directly produce the final result using only the provided background data.
      Do not ask the user for additional content.
    `,
  });
}

export function getEditPrompt(
  editor: SlateEditor,
  { isSelecting, messages }: { isSelecting: boolean; messages: ChatMessage[] }
) {
  if (!isSelecting)
    throw new Error('Edit tool is only available when selecting');
  if (isMultiBlocks(editor)) {
    const selectingMarkdown = getMarkdownWithSelection(editor);

    return buildStructuredPrompt({
      backgroundData: selectingMarkdown,
      examples: [
        // 1) Fix grammar
        'User: Fix grammar.\nbackgroundData: # User Guide\nThis guide explain how to install the app.\nOutput:\n# User Guide\nThis guide explains how to install the application.',

        // 2) Make the tone more formal and professional
        "User: Make the tone more formal and professional.\nbackgroundData: ## Intro\nHey, here's how you can set things up quickly.\nOutput:\n## Introduction\nThis section describes the setup procedure in a clear and professional manner.",

        // 3) Make it more concise without losing meaning
        'User: Make it more concise without losing meaning.\nbackgroundData: The purpose of this document is to provide an overview that explains, in detail, all the steps required to complete the installation.\nOutput:\nThis document provides a detailed overview of the installation steps.',
      ],
      history: formatTextFromMessages(messages),
      outputFormatting: 'markdown',
      rules: dedent`
        - Do not Write <backgroundData> tags in your response.
        - <backgroundData> represents the full blocks of text the user has selected and wants to modify or ask about.
        - Your response should be a direct replacement for the entire <backgroundData>.
        - Maintain the overall structure and formatting of the background data, unless explicitly instructed otherwise.
        - CRITICAL: Provide only the content to replace <backgroundData>. Do not add additional blocks or change the block structure unless specifically requested.
      `,
      task: `The following <backgroundData> is user-provided Markdown content that needs improvement. Modify it according to the user's instruction.
      Unless explicitly stated otherwise, your output should be a seamless replacement of the original content.`,
    });
  }

  addSelection(editor);

  const selectingMarkdown = getMarkdownWithSelection(editor);
  const endIndex = selectingMarkdown.indexOf('<Selection>');
  const prefilledResponse = selectingMarkdown.slice(0, endIndex);

  return buildStructuredPrompt({
    backgroundData: selectingMarkdown,
    examples: [
      // 1) Improve word choice
      'User: Improve word choice.\nbackgroundData: This is a <Selection>nice</Selection> person.\nOutput: great',

      // 2) Fix grammar
      'User: Fix grammar.\nbackgroundData: He <Selection>go</Selection> to school every day.\nOutput: goes',

      // 3) Make tone more polite
      'User: Make tone more polite.\nbackgroundData: <Selection>Give me</Selection> the report.\nOutput: Please provide',

      // 4) Make tone more confident
      'User: Make tone more confident.\nbackgroundData: I <Selection>think</Selection> this might work.\nOutput: believe',

      // 5) Simplify language
      'User: Simplify the language.\nbackgroundData: The results were <Selection>exceedingly</Selection> positive.\nOutput: very',

      // 6) Translate into French
      'User: Translate into French.\nbackgroundData: <Selection>Hello</Selection>\nOutput: Bonjour',

      // 7) Expand description
      'User: Expand the description.\nbackgroundData: The view was <Selection>beautiful</Selection>.\nOutput: breathtaking and full of vibrant colors',

      // 8) Make it sound more natural
      'User: Make it sound more natural.\nbackgroundData: She <Selection>did a party</Selection> yesterday.\nOutput: had a party',
    ],
    history: formatTextFromMessages(messages),
    outputFormatting: 'markdown',
    prefilledResponse,
    rules: dedent`
      - <Selection> contains the text segment selected by the user and allowed to be modified.
      - Your response will be directly concatenated with the prefilledResponse, so please make sure the result is smooth and coherent.
      - You may only edit the content inside <Selection> and must not reference or retain any external context.
      - The output must be text that can directly replace <Selection>.
      - Do not include the <Selection> tags or any surrounding text in the output.
      - Ensure the replacement is grammatically correct and reads naturally.
      - If the input is invalid or cannot be improved, return it unchanged.
    `,
    task: dedent`
      The following background data is user-provided text that contains one or more <Selection> tags marking the editable parts.
      You must only modify the text inside <Selection>.
      Your output should be a direct replacement for the selected text, without including any tags or surrounding content.
      Ensure the replacement is grammatically correct and fits naturally when substituted back into the original text.
    `,
  });
}
