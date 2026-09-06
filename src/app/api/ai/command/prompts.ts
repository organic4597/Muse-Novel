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
      '사용자: "주인공이 문을 여는 장면을 이어 써줘" → generate',
      '사용자: "선택한 문장의 맞춤법을 고쳐줘" + 선택 원문 있음 → edit',
      '사용자: "이 장면의 긴장감을 높여줘" + 선택 원문 있음 → edit',
    ],
    history: formatTextFromMessages(messages, { limit: 8 }),
    rules: dedent`
      - 기본값은 "generate"다. 새 본문·아이디어·질문·이어쓰기 요청은 "generate"다.
      - 선택 원문이 있고 그 원문을 교정·변환·번역·축약하라고 요청한 경우에만 "edit"다.
      - 설명 없이 enum 값 하나만 출력한다.
    `,
    task: `마지막 사용자 요청을 "generate" 또는 "edit"로 분류하라.`,
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
      history: formatTextFromMessages(messages, { limit: 12 }),
      rules: dedent`
        - 원문의 언어, 문자 체계, 시점, 시제와 고유명사를 유지한다.
        - 사용자가 번역을 명시한 경우에만 번역한다.
        - 주변 문장과 자연스럽게 연결되는 최종 교체문만 평문으로 출력한다.
        - Selection/XML 태그, 코드 울타리, 라벨, 목록, 예시, 설명을 출력하지 않는다.
        - 선택된 원문만 교체하고 주변 문맥은 출력하지 않는다.
        - 의미 변경이 요청되지 않았다면 핵심 의미와 사실을 보존한다.
      `,
      task: dedent`
        다음 지시에 따라 선택된 소설 원문을 고쳐라: ${rewriteInstruction}
        주변 단락에 바로 연결할 수 있는 깨끗한 교체문만 출력하라.
      `,
    });
  }

  return buildStructuredPrompt({
    backgroundData: selectingMarkdown,
    history: formatTextFromMessages(messages, { limit: 12 }),
    rules: dedent`
      - <Selection>은 사용자가 선택한 원문이고 backgroundData는 현재 원고 문맥이다.
      - 마지막 사용자 지시를 우선하며 필요한 자료는 backgroundData에서 찾는다.
      - 이어쓰기라면 직전 내용을 요약하거나 반복하지 않고 행동·대사·감각·정보 중 하나를 전진시킨다.
      - 기존 인물, 고유명사, 시점, 시제, 호칭과 문체를 유지한다.
      - 요청하지 않은 설정이나 인물을 임의로 추가하지 않는다.
      - <u>, <callout>, <kbd>, <toc>, <sub>, <sup>, <mark>, <del>, <date>, <span>, <column>, <column_group>, <file>, <audio>, <video> 같은 MDX 태그는 명시적 요청이 없으면 유지한다.
      - Markdown/MDX 결과를 코드 울타리로 감싸지 않고 구조화된 영역의 들여쓰기와 줄바꿈을 보존한다.
      - 결과를 바로 원고에 삽입할 수 있도록 답변·설명·자기평가 없이 결과물만 출력한다.
    `,
    task: dedent`
      사용자의 마지막 지시와 작품 문맥을 바탕으로 요청된 소설 본문 또는 편집 결과를 완성하라.
      답변 전에 연속성, 중복, 문체와 출력 범위를 내부적으로 점검하고 최종 결과만 출력하라.
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
        '사용자: 맞춤법을 고쳐줘.\nbackgroundData: 그는 한참을 망서리다 문을 열엇다.\nOutput:\n그는 한참을 망설이다 문을 열었다.',
        '사용자: 긴장감을 높여줘.\nbackgroundData: 문밖에서 발소리가 났다. 지수는 가만히 있었다.\nOutput:\n문밖의 발소리가 문턱 앞에서 멎었다. 지수는 들숨조차 삼킨 채 손잡이만 바라봤다.',
      ],
      history: formatTextFromMessages(messages, { limit: 12 }),
      outputFormatting: 'markdown',
      rules: dedent`
        - backgroundData는 사용자가 선택한 전체 원문 블록이다.
        - 답변은 backgroundData 전체를 대신할 수 있는 직접 교체문이어야 한다.
        - 명시적 요청이 없으면 원문의 언어, 사실, 고유명사, 시점과 Markdown 구조를 유지한다.
        - backgroundData 태그, 설명 또는 주변 블록을 출력하지 않는다.
      `,
      task: `사용자의 마지막 지시에 따라 선택된 소설 원문을 수정하고, 원본 자리에 그대로 넣을 최종 교체문만 출력하라.`,
    });
  }

  addSelection(editor);

  const selectingMarkdown = getMarkdownWithSelection(editor);
  const endIndex = selectingMarkdown.indexOf('<Selection>');
  const prefilledResponse = selectingMarkdown.slice(0, endIndex);

  return buildStructuredPrompt({
    backgroundData: selectingMarkdown,
    examples: [
      '사용자: 맞춤법을 고쳐줘.\nbackgroundData: 그는 <Selection>문을 열엇다</Selection>.\nOutput: 문을 열었다',
      '사용자: 더 불안한 느낌으로 바꿔줘.\nbackgroundData: 발소리가 <Selection>가까워졌다</Selection>.\nOutput: 문턱 바로 앞에서 멎었다',
      '사용자: 자연스럽게 줄여줘.\nbackgroundData: 그녀는 <Selection>천천히 느린 걸음으로</Selection> 다가왔다.\nOutput: 천천히',
    ],
    history: formatTextFromMessages(messages, { limit: 12 }),
    outputFormatting: 'markdown',
    prefilledResponse,
    rules: dedent`
      - <Selection> 안의 텍스트만 수정할 수 있다.
      - 출력은 prefilledResponse 뒤에 바로 이어 붙으므로 문법과 띄어쓰기가 자연스러워야 한다.
      - Selection 태그와 주변 문장은 출력하지 않고 직접 교체할 텍스트만 출력한다.
      - 원문의 언어, 의미, 고유명사와 문체를 유지한다.
      - 개선할 수 없거나 입력이 불완전하면 선택 원문을 그대로 반환한다.
    `,
    task: dedent`
      backgroundData에서 Selection으로 표시된 부분을 마지막 사용자 지시에 맞게 수정하라.
      원문에 그대로 치환할 최종 텍스트만 출력하라.
    `,
  });
}
