import { describe, expect, it } from 'vitest';
import { parseWorldRequestAnalysis } from '@/lib/ai/world-prompts';
import { researchQueriesSchema } from './query-plan';

describe('tolerant model query plans with a strict execution budget', () => {
  it('accepts the reported lookupQueries overflow without aborting world generation', () => {
    expect(parseWorldRequestAnalysis({ taskSummary: '요청한 개별 구성원 정보', lookupQueries: ['오대세가 구성', '구파일방 구성', '무협 문파 특징'] }))
      .toMatchObject({ lookupQueries: ['오대세가 구성', '구파일방 구성'] });
  });
  it('keeps model-classified create, update and mixed operations without keyword parsing', () => {
    expect(parseWorldRequestAnalysis({ taskSummary: '기존 설정 보강', operation: 'update', lookupQueries: [] }).operation).toBe('update');
    expect(parseWorldRequestAnalysis({ taskSummary: '새 장소와 기존 도시 수정', operation: 'mixed', lookupQueries: [] }).operation).toBe('mixed');
    expect(parseWorldRequestAnalysis({ taskSummary: '예전 모델 호환', lookupQueries: [] }).operation).toBe('create');
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
