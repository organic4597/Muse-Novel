import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildWritingKnowledgeContext,
  loadWritingKnowledge,
  resetWritingKnowledgeCacheForTests,
  runWritingKnowledgeAgent,
  searchWritingKnowledge,
  selectWritingKnowledgeDocuments,
} from './writing-knowledge';

let tempDirectory = '';

beforeEach(() => {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-knowledge-'));
  process.env.WRITING_KNOWLEDGE_DIR = tempDirectory;
  resetWritingKnowledgeCacheForTests();
});

afterEach(() => {
  process.env.WRITING_KNOWLEDGE_DIR = '';
  fs.rmSync(tempDirectory, { recursive: true, force: true });
  resetWritingKnowledgeCacheForTests();
});

function addDocument(name: string, metadata: string, body: string) {
  fs.writeFileSync(
    path.join(tempDirectory, `${name}.md`),
    `---\n${metadata}\n---\n${body}`
  );
}

describe('writing knowledge', () => {
  it('loads valid Markdown documents and ignores files without metadata', () => {
    addDocument(
      'scene',
      'id: scene-beats\ntitle: 장면 비트\ncategory: structure\ntags: [장면, 갈등]\nsummary: 장면의 목표와 갈등',
      '# 장면\n인물에게 목표를 준다.'
    );
    fs.writeFileSync(path.join(tempDirectory, 'invalid.md'), '# metadata 없음');

    expect(loadWritingKnowledge()).toHaveLength(1);
    expect(loadWritingKnowledge()[0]?.tags).toEqual(['장면', '갈등']);
    expect(loadWritingKnowledge()[0]?.kind).toBe('craft');
  });

  it('ranks Korean title and tag matches ahead of body-only matches', () => {
    addDocument(
      'dialogue',
      'id: dialogue\ntitle: 대사와 서브텍스트\ncategory: craft\ntags: [대사, 서브텍스트]\nsummary: 말하지 않은 욕망을 대사에 담기',
      '인물은 서로 다른 목적을 가진다.'
    );
    addDocument(
      'scene',
      'id: scene\ntitle: 장면 설계\ncategory: structure\ntags: [장면]\nsummary: 장면 구성',
      '대사는 갈등을 드러낼 수 있다.'
    );

    expect(searchWritingKnowledge('대사')[0]?.id).toBe('dialogue');
  });

  it('reloads newly added files without restarting the process', () => {
    addDocument(
      'first',
      'id: first\ntitle: 첫 문서\ncategory: craft\ntags: [기초]\nsummary: 첫 문서',
      '첫 내용'
    );
    expect(loadWritingKnowledge()).toHaveLength(1);

    addDocument(
      'second',
      'id: second\ntitle: 둘째 문서\ncategory: craft\ntags: [추가]\nsummary: 둘째 문서',
      '둘째 내용이 더 길다.'
    );
    expect(loadWritingKnowledge()).toHaveLength(2);
  });

  it('builds a bounded reference context', () => {
    addDocument(
      'pacing',
      'id: pacing\ntitle: 긴장과 속도\ncategory: craft\ntags: [긴장, 속도]\nsummary: 장면 속도 조절',
      '긴 문장과 짧은 문장을 목적에 따라 배치한다.'.repeat(30)
    );

    const context = buildWritingKnowledgeContext('긴장', 300);
    expect(context).toContain('긴장과 속도');
    expect(context.length).toBeLessThanOrEqual(300);
  });

  it('balances genre, craft, and domain expert lenses', () => {
    addDocument(
      'fantasy',
      'id: fantasy\ntitle: 판타지 전투\ncategory: 장르\nkind: genre\nexpertise: 판타지 규칙\ntags: [전투]\nsummary: 판타지 전투 규칙',
      '마법의 비용을 지킨다.'
    );
    addDocument(
      'action',
      'id: action\ntitle: 액션 장면\ncategory: 장면\nkind: craft\nexpertise: 장면 설계\ntags: [전투]\nsummary: 전투 장면 구성',
      '목표와 갈등을 정한다.'
    );
    addDocument(
      'injury',
      'id: injury\ntitle: 전투 부상\ncategory: 분야 자료\nkind: domain\nexpertise: 부상 연속성\ntags: [전투]\nsummary: 부상 후속 결과',
      '부상은 다음 장면에도 남는다.'
    );

    const context = buildWritingKnowledgeContext(
      '판타지 전투 장면에서 부상과 규칙을 유지하는 방법',
      1000
    );
    expect(context).toContain('판타지 전투');
    expect(context).toContain('액션 장면');
    expect(context).toContain('전투 부상');
    expect(
      selectWritingKnowledgeDocuments(
        '판타지 전투 장면에서 부상과 규칙을 유지하는 방법'
      )
    ).toHaveLength(3);
  });

  it('keeps expert diversity when one long source creates many high-score chunks', () => {
    for (let index = 0; index < 15; index += 1) {
      addDocument(
        `domain-${index}`,
        `id: domain-${index}\ntitle: 인공지능 자료 ${index}\ncategory: 분야 원문\nkind: domain\ntags: [인공지능, 도시]\nsummary: 인공지능 도시 배경`,
        '인공지능 도시의 기술과 정치 자료'
      );
    }
    addDocument(
      'cyberpunk',
      'id: cyberpunk\ntitle: 사이버펑크\ncategory: 장르 자료\nkind: genre\ntags: [사이버펑크, 도시]\nsummary: 사이버펑크 장르',
      '기술과 불평등을 연결한다.'
    );
    addDocument(
      'scene-craft',
      'id: scene-craft\ntitle: 도시 장면 설계\ncategory: 장면\nkind: craft\ntags: [도시, 장면]\nsummary: 도시 장면을 쓰는 법',
      '관점 인물의 목표로 장면을 전진시킨다.'
    );

    const selected = selectWritingKnowledgeDocuments(
      '사이버펑크 인공지능 도시 장면'
    );
    expect(new Set(selected.map((document) => document.kind))).toEqual(
      new Set(['domain', 'genre', 'craft'])
    );
  });

  it('uses a query-expansion loop to find dialogue craft instead of unrelated diversity', () => {
    addDocument(
      'character',
      'id: character\ntitle: 인물 설계\ncategory: 인물\nkind: craft\ntags: [인물]\nsummary: 인물의 욕망 설계',
      '인물의 목표와 결핍을 정한다.'
    );
    addDocument(
      'dialogue',
      'id: dialogue\ntitle: 목적과 서브텍스트가 있는 대사\ncategory: 대사\nkind: craft\ntags: [대사, 서브텍스트]\nsummary: 자연스러운 대화의 목적',
      '대사는 인물의 목적이 충돌하는 행동이다.'
    );
    addDocument(
      'economy',
      'id: economy\ntitle: 경제와 물류\ncategory: 분야 자료\nkind: domain\ntags: [경제]\nsummary: 물류 설계',
      '화폐와 보급로를 정한다.'
    );

    const result = runWritingKnowledgeAgent({
      instruction: '인물의 대화를 자연스럽게 써줘',
      maxChars: 800,
    });

    expect(result.matches.some((document) => document.id === 'dialogue')).toBe(true);
    expect(result.context).toContain('대사는 인물의 목적이 충돌하는 행동이다.');
  });

  it('extracts the relevant paragraph even when it is at the end of a document', () => {
    addDocument(
      'late-detail',
      'id: late-detail\ntitle: 장면 종합\ncategory: 작법\nkind: craft\ntags: [장면]\nsummary: 여러 장면 작법',
      `${'일반적인 도입 설명입니다. '.repeat(40)}\n\n대사 장면에서는 침묵과 질문으로 되받기를 활용한다.`
    );

    const context = buildWritingKnowledgeContext('대사 침묵 질문', 400);

    expect(context).toContain('침묵과 질문으로 되받기');
  });
});
