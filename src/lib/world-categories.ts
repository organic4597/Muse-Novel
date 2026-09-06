/** Shared by world filters, entry forms, and AI suggestions. Custom categories remain supported. */
export const WORLD_CATEGORY_OPTIONS = [
  '장소', '마법', '종족', '문화', '역사', '기술', '사건', '물건', '기타',
] as const;

export const WORLD_CATEGORY_GUIDANCE =
  '사용자가 별도 분류를 지정하지 않았다면 영약·무기·장비·유물·재료는 물건으로, 다른 분류에 맞지 않는 설정은 기타로 분류한다. 영약·무기 같은 세부 유형은 tags에 넣는다.';

export const WORLD_CATEGORY_TRAITS = ['organization', 'location', 'item'] as const;
export type WorldCategoryTrait = (typeof WORLD_CATEGORY_TRAITS)[number];
export type WorldCategoryRecord = { id?: string; name: string; aliasesJson?: string | null; traits?: WorldCategoryTrait[] };
export const worldCategoryKey = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase('ko-KR');

export function worldCategoryAliases(category: WorldCategoryRecord): string[] {
  try {
    const values: unknown = JSON.parse(category.aliasesJson ?? '[]');
    return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [];
  } catch { return []; }
}

export function resolveWorldCategoryName(categories: readonly WorldCategoryRecord[], name: string) {
  const key = worldCategoryKey(name);
  return categories.find((category) => [category.name, ...worldCategoryAliases(category)].some((value) => worldCategoryKey(value) === key))?.name ?? name;
}

export function getWorldCategoryOptions(categories: readonly WorldCategoryRecord[], usedNames: readonly string[] = []) {
  return [...new Set([...WORLD_CATEGORY_OPTIONS, ...categories.map(({ name }) => name), ...usedNames]
    .map((name) => resolveWorldCategoryName(categories, name)))];
}
