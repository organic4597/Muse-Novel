import { describe, expect, it } from 'vitest';
import { parseWorldRequestAnalysis } from '@/lib/ai/world-prompts';
import { researchQueriesSchema } from './query-plan';

describe('tolerant model query plans with a strict execution budget', () => {
  it('accepts the reported lookupQueries overflow without aborting world generation', () => {
    expect(parseWorldRequestAnalysis({ taskSummary: '요청한 개별 구성원 정보', lookupQueries: ['오대세가 구성', '구파일방 구성', '무협 문파 특징'] }))
      .toMatchObject({ lookupQueries: ['오대세가 구성', '구파일방 구성'] });
  });
  it('deduplicates and removes unsafe or malformed candidates before taking two', () => {
    expect(researchQueriesSchema.parse([' ', 12, 'api_key secret', ' ＷＯＲＬＤ  lore ', 'world lore', '구파일방 구성', '다른 자료']))
      .toEqual(['WORLD lore', '구파일방 구성']);
  });
  it('drops overlong strings instead of truncating private or incomplete text', () => {
    expect(researchQueriesSchema.parse(['a'.repeat(101), '안전한 검색어'])).toEqual(['안전한 검색어']);
  });
  it('accepts empty optional queries but rejects arbitrary non-array values', () => {
    expect(researchQueriesSchema.parse(undefined)).toEqual([]);
    expect(researchQueriesSchema.parse(null)).toEqual([]);
    expect(() => researchQueriesSchema.parse({ query: '본문' })).toThrow();
  });
  it('does not leak raw schema validation JSON for other invalid analysis fields', () => {
    expect(() => parseWorldRequestAnalysis({ lookupQueries: [] })).toThrow('AI가 생성 요청을');
    expect(() => parseWorldRequestAnalysis({ taskSummary: '요약', lookupQueries: '원고' })).toThrow('AI가 생성 요청을');
  });
});
