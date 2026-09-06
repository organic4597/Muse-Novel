import { and, asc, eq, inArray } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import { worldCategories, worldCategoryTraits, worldEntries, worldEntrySuggestions } from '@/lib/db/schema';
import { getWorldCategoryOptions, resolveWorldCategoryName, type WorldCategoryTrait, worldCategoryAliases, worldCategoryKey } from '@/lib/world-categories';

export class WorldCategoryRenameError extends Error {}
export class WorldCategoryDeleteError extends Error {}

/** Synchronous to keep category resolution and writes within one SQLite turn/transaction. */
export function resolveStoredWorldCategoryName(db: DB, projectId: string, name: string) {
  const categories = db.select().from(worldCategories).where(eq(worldCategories.projectId, projectId)).all();
  return resolveWorldCategoryName(categories, name);
}

function listWorldCategoriesWithTraits(db: DB, projectId: string) {
  const categories = db.select().from(worldCategories)
    .where(eq(worldCategories.projectId, projectId))
    .orderBy(asc(worldCategories.name)).all();
  if (!categories.length) return [];
  const traits = db.select().from(worldCategoryTraits)
    .where(inArray(worldCategoryTraits.categoryId, categories.map((category) => category.id))).all();
  return categories.map((category) => ({ ...category,
    traits: traits.filter((trait) => trait.categoryId === category.id).map((trait) => trait.trait),
  }));
}

export async function listWorldCategories(db: DB, projectId: string) {
  return listWorldCategoriesWithTraits(db, projectId);
}

export async function setWorldCategoryTraits(db: DB, projectId: string, categoryId: string, traits: WorldCategoryTrait[]) {
  return db.transaction((tx: DB) => {
    const category = tx.select().from(worldCategories)
      .where(and(eq(worldCategories.projectId, projectId), eq(worldCategories.id, categoryId))).get();
    if (!category) throw new WorldCategoryRenameError('카테고리를 찾을 수 없습니다.');
    tx.delete(worldCategoryTraits).where(eq(worldCategoryTraits.categoryId, categoryId)).run();
    for (const trait of [...new Set(traits)]) tx.insert(worldCategoryTraits).values({ categoryId, trait }).run();
    return { ...category, traits: [...new Set(traits)] };
  }, { behavior: 'immediate' });
}

export function listWorldEntriesByTrait(db: DB, projectId: string, trait: WorldCategoryTrait) {
  const categories = db.select().from(worldCategories).where(eq(worldCategories.projectId, projectId)).all();
  if (!categories.length) return [];
  const categoryIds = db.select({ categoryId: worldCategoryTraits.categoryId }).from(worldCategoryTraits)
    .where(and(eq(worldCategoryTraits.trait, trait), inArray(worldCategoryTraits.categoryId, categories.map((category) => category.id)))).all()
    .map((row) => row.categoryId);
  const names: string[] = categories.filter((category) => categoryIds.includes(category.id))
    .flatMap((category) => [category.name, ...worldCategoryAliases(category)]);
  if (!names.length) return [];
  return db.select().from(worldEntries)
    .where(and(eq(worldEntries.projectId, projectId), inArray(worldEntries.category, [...new Set(names)])))
    .orderBy(asc(worldEntries.title)).all();
}

export async function createWorldCategory(db: DB, projectId: string, name: string) {
  const resolvedName = resolveStoredWorldCategoryName(db, projectId, name);
  await db.insert(worldCategories).values({ projectId, name: resolvedName })
    .onConflictDoNothing({ target: [worldCategories.projectId, worldCategories.name] }).run();
  return resolvedName;
}

export async function renameWorldCategory(db: DB, projectId: string, oldName: string, name: string) {
  return db.transaction((tx: DB) => {
    const categories = tx.select().from(worldCategories).where(eq(worldCategories.projectId, projectId)).all();
    const entries = tx.select({ category: worldEntries.category }).from(worldEntries).where(eq(worldEntries.projectId, projectId)).all();
    const suggestions = tx.select({ category: worldEntrySuggestions.category }).from(worldEntrySuggestions).where(eq(worldEntrySuggestions.projectId, projectId)).all();
    const key = worldCategoryKey;
    const currentName = resolveWorldCategoryName(categories, oldName);
    if (currentName !== oldName && key(currentName) !== key(oldName)) {
      if (currentName === name) return { name, updatedEntries: 0, updatedSuggestions: 0, categories };
      throw new WorldCategoryRenameError('이미 이름이 변경된 카테고리입니다. 새로고침 후 다시 시도해주세요.');
    }
    const options = getWorldCategoryOptions(categories, [...entries, ...suggestions].map((entry) => entry.category));
    if (!options.some((option) => key(option) === key(oldName))) throw new WorldCategoryRenameError('변경할 카테고리를 찾을 수 없습니다.');
    const current = categories.find((category) => key(category.name) === key(oldName));
    if (options.some((option) => key(option) === key(name) && key(option) !== key(oldName)) ||
      categories.some((category) => category !== current && worldCategoryAliases(category).some((alias) => key(alias) === key(name)))) {
      throw new WorldCategoryRenameError('이미 사용 중인 카테고리 이름입니다. 다른 이름을 입력해주세요.');
    }
    const aliases = [...new Set([...(current ? worldCategoryAliases(current) : []), oldName])].filter((alias) => alias !== name);
    if (current) tx.update(worldCategories).set({ name, aliasesJson: JSON.stringify(aliases) }).where(eq(worldCategories.id, current.id)).run();
    else tx.insert(worldCategories).values({ projectId, name, aliasesJson: JSON.stringify(aliases) }).run();
    const oldKeys = new Set([oldName, ...aliases].map(key));
    const names = [...new Set([oldName, ...entries, ...suggestions].map((value) => typeof value === 'string' ? value : value.category).filter((value) => oldKeys.has(key(value))))];
    const updatedEntries = tx.update(worldEntries).set({ category: name, updatedAt: new Date() })
      .where(and(eq(worldEntries.projectId, projectId), inArray(worldEntries.category, names))).returning({ id: worldEntries.id }).all().length;
    const updatedSuggestions = tx.update(worldEntrySuggestions).set({ category: name })
      .where(and(eq(worldEntrySuggestions.projectId, projectId), inArray(worldEntrySuggestions.category, names))).returning({ id: worldEntrySuggestions.id }).all().length;
    return { name, updatedEntries, updatedSuggestions,
      categories: listWorldCategoriesWithTraits(tx, projectId) };
  }, { behavior: 'immediate' });
}

/** Remove a category by transferring its contents and old-name routing to an existing category. */
export async function deleteWorldCategory(db: DB, projectId: string, name: string, targetName: string) {
  return db.transaction((tx: DB) => {
    const categories = tx.select().from(worldCategories).where(eq(worldCategories.projectId, projectId)).all();
    const entries = tx.select({ category: worldEntries.category }).from(worldEntries).where(eq(worldEntries.projectId, projectId)).all();
    const suggestions = tx.select({ category: worldEntrySuggestions.category }).from(worldEntrySuggestions).where(eq(worldEntrySuggestions.projectId, projectId)).all();
    const key = worldCategoryKey;
    const currentName = resolveWorldCategoryName(categories, name);
    const destination = resolveWorldCategoryName(categories, targetName);
    if (key(name) === key(targetName)) throw new WorldCategoryDeleteError('삭제할 카테고리와 이동할 카테고리는 달라야 합니다.');
    if (key(currentName) !== key(name)) {
      if (key(currentName) === key(destination)) return { name, targetName: destination, updatedEntries: 0, updatedSuggestions: 0, categories };
      throw new WorldCategoryDeleteError('이미 변경되거나 삭제된 카테고리입니다. 새로고침 후 확인해주세요.');
    }
    const options = getWorldCategoryOptions(categories, [...entries, ...suggestions].map((entry) => entry.category));
    if (!options.some((option) => key(option) === key(name))) throw new WorldCategoryDeleteError('삭제할 카테고리를 찾을 수 없습니다.');
    if (key(currentName) === key(destination) || !options.some((option) => key(option) === key(destination))) {
      throw new WorldCategoryDeleteError('항목을 보관할 다른 카테고리를 선택해주세요. 마지막 카테고리는 삭제할 수 없습니다.');
    }
    const current = categories.find((category) => key(category.name) === key(name));
    const target = categories.find((category) => key(category.name) === key(destination));
    const sourceAliases = [name, ...(current ? worldCategoryAliases(current) : [])];
    const aliases = [...new Set([...sourceAliases, ...(target ? worldCategoryAliases(target) : [])])].filter((alias) => key(alias) !== key(destination));
    const oldKeys = new Set(sourceAliases.map(key));
    const oldNames = [...new Set([name, ...entries.map((entry) => entry.category), ...suggestions.map((entry) => entry.category)]
      .filter((value) => oldKeys.has(key(value))))];
    const updatedEntries = tx.update(worldEntries).set({ category: destination, updatedAt: new Date() })
      .where(and(eq(worldEntries.projectId, projectId), inArray(worldEntries.category, oldNames))).returning({ id: worldEntries.id }).all().length;
    const updatedSuggestions = tx.update(worldEntrySuggestions).set({ category: destination })
      .where(and(eq(worldEntrySuggestions.projectId, projectId), inArray(worldEntrySuggestions.category, oldNames))).returning({ id: worldEntrySuggestions.id }).all().length;
    if (current) tx.delete(worldCategories).where(eq(worldCategories.id, current.id)).run();
    if (target) tx.update(worldCategories).set({ aliasesJson: JSON.stringify(aliases) }).where(eq(worldCategories.id, target.id)).run();
    else tx.insert(worldCategories).values({ projectId, name: destination, aliasesJson: JSON.stringify(aliases) }).run();
    return { name, targetName: destination, updatedEntries, updatedSuggestions,
      categories: listWorldCategoriesWithTraits(tx, projectId) };
  }, { behavior: 'immediate' });
}
