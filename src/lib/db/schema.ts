import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = sqliteTable('projects', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  genre: text('genre'),
  synopsis: text('synopsis'),
  settingsJson: text('settings_json'),
  writingStyleSample: text('writing_style_sample'),
  writingStyleDescription: text('writing_style_description'),
  activeWritingStyleProfileId: text('active_writing_style_profile_id'),
  activeLoraId: text('active_lora_id'),
  loraPath: text('lora_path'),
  loraGeneratedAt: integer('lora_generated_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── Chapters ────────────────────────────────────────────────────────────────

export const chapters = sqliteTable('chapters', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  title: text('title').notNull(),
  order: integer('order').notNull(),
  contentJson: text('content_json'),
  outline: text('outline'),
  summary: text('summary'),
  memo: text('memo'),
  wordCount: integer('word_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── Characters ──────────────────────────────────────────────────────────────

export const characters = sqliteTable('characters', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  role: text('role'),
  appearance: text('appearance'),
  personality: text('personality'),
  backstory: text('backstory'),
  arcDescription: text('arc_description'),
  imagePath: text('image_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── Character Relationships ─────────────────────────────────────────────────

export const characterRelationships = sqliteTable('character_relationships', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterAId: text('character_a_id')
    .notNull()
    .references(() => characters.id),
  characterBId: text('character_b_id')
    .notNull()
    .references(() => characters.id),
  relationshipType: text('relationship_type').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── World Entries ───────────────────────────────────────────────────────────

export const worldEntries = sqliteTable('world_entries', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  category: text('category').notNull(),
  title: text('title').notNull(),
  content: text('content'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── World Entry Links ───────────────────────────────────────────────────────

export const worldEntryLinks = sqliteTable('world_entry_links', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sourceId: text('source_id')
    .notNull()
    .references(() => worldEntries.id),
  targetId: text('target_id')
    .notNull()
    .references(() => worldEntries.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── World Entry Tags ────────────────────────────────────────────────────────

export const worldEntryTags = sqliteTable('world_entry_tags', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  entryId: text('entry_id')
    .notNull()
    .references(() => worldEntries.id),
  tag: text('tag').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── AI Provider Settings ────────────────────────────────────────────────────

export const aiProviderSettings = sqliteTable('ai_provider_settings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id),
  providerType: text('provider_type').notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  modelName: text('model_name'),
  baseUrl: text('base_url'),
  contextSize: integer('context_size'),
  isDefault: integer('is_default').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── Character Emotions ─────────────────────────────────────────────────────

export const characterEmotions = sqliteTable('character_emotions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterId: text('character_id')
    .notNull()
    .references(() => characters.id),
  chapterId: text('chapter_id')
    .notNull()
    .references(() => chapters.id),
  emotion: text('emotion').notNull(),
  note: text('note'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── Writing Style Profiles ─────────────────────────────────────────────────

export const writingStyleProfiles = sqliteTable('writing_style_profiles', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id),
  name: text('name').notNull(),
  filePath: text('file_path'),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── LoRA Adapters ─────────────────────────────────────────────────────────

export const loras = sqliteTable('loras', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  sourceDescription: text('source_description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});
