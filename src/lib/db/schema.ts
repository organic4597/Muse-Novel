import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

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

export const chapters = sqliteTable(
  'chapters',
  {
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
    storyYear: integer('story_year'),
    storyMonth: integer('story_month'),
    storyDay: integer('story_day'),
    storyTimeLabel: text('story_time_label'),
    storyDatePrecision: text('story_date_precision', {
      enum: ['none', 'year', 'month', 'day', 'time', 'relative'],
    }).notNull().default('none'),
    storyDateLabel: text('story_date_label'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
  },
  (table) => [
    index('chapters_project_id_order_idx').on(table.projectId, table.order),
  ]
);

// ─── Semantic Story Memory ───────────────────────────────────────────────────────

/**
 * Searchable, source-addressable chunks of project canon. Embeddings are kept
 * as JSON so the default SQLite deployment needs no vector extension. The
 * source hash makes indexing incremental and the nullable vector lets keyword
 * retrieval continue when the optional embedding service is offline.
 */
export const semanticMemoryChunks = sqliteTable(
  'semantic_memory_chunks',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    sourceTitle: text('source_title').notNull(),
    sourceUpdatedAt: integer('source_updated_at', { mode: 'timestamp' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash').notNull(),
    embeddingJson: text('embedding_json'),
    embeddingModel: text('embedding_model'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
  },
  (table) => [
    uniqueIndex('semantic_memory_source_chunk_uidx').on(
      table.projectId,
      table.sourceType,
      table.sourceId,
      table.chunkIndex
    ),
    index('semantic_memory_project_source_idx').on(
      table.projectId,
      table.sourceType,
      table.sourceId
    ),
  ]
);

// ─── Characters ──────────────────────────────────────────────────────────────

export const characters = sqliteTable(
  'characters',
  {
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
    voiceGuide: text('voice_guide'),
    voiceExamplesJson: text('voice_examples_json'),
    itemsJson: text('items_json'),
    imagePath: text('image_path'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
  },
  (table) => [index('characters_project_id_idx').on(table.projectId)]
);

// ─── Persistent Story State Notes ───────────────────────────────────────────

export const storyStateEntries = sqliteTable(
  'story_state_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    characterId: text('character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    chapterId: text('chapter_id').references(() => chapters.id, {
      onDelete: 'set null',
    }),
    endChapterId: text('end_chapter_id').references(() => chapters.id, {
      onDelete: 'set null',
    }),
    worldEntryId: text('world_entry_id'),
    knowledgeScope: text('knowledge_scope', {
      enum: ['canon', 'reader', 'character'],
    }).notNull().default('canon'),
    knowerCharacterId: text('knower_character_id').references(() => characters.id, {
      onDelete: 'set null',
    }),
    certainty: text('certainty', {
      enum: ['known', 'suspected', 'believed'],
    }).notNull().default('known'),
    evidence: text('evidence'),
    category: text('category').notNull(),
    label: text('label').notNull(),
    value: text('value').notNull(),
    previousValue: text('previous_value'),
    details: text('details'),
    isActive: integer('is_active').notNull().default(1),
    isPinned: integer('is_pinned').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
  },
  (table) => [
    index('story_state_project_active_pinned_idx').on(
      table.projectId,
      table.isActive,
      table.isPinned
    ),
    index('story_state_character_category_idx').on(
      table.characterId,
      table.category
    ),
    index('story_state_chapter_id_idx').on(table.chapterId),
    index('story_state_time_range_idx').on(
      table.projectId,
      table.chapterId,
      table.endChapterId
    ),
    index('story_state_knowledge_idx').on(
      table.projectId,
      table.knowledgeScope,
      table.knowerCharacterId
    ),
  ]
);

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

export const worldCategories = sqliteTable(
  'world_categories',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    aliasesJson: text('aliases_json'),
  },
  (table) => [uniqueIndex('world_categories_project_name_idx').on(table.projectId, table.name)]
);

export const worldCategoryTraits = sqliteTable(
  'world_category_traits',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    categoryId: text('category_id').notNull().references(() => worldCategories.id, { onDelete: 'cascade' }),
    trait: text('trait', { enum: ['organization', 'location', 'item'] }).notNull(),
  },
  (table) => [uniqueIndex('world_category_traits_category_trait_idx').on(table.categoryId, table.trait)]
);

export const worldEntries = sqliteTable(
  'world_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    category: text('category').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    researchJson: text('research_json'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
      () => new Date()
    ),
  },
  (table) => [
    index('world_entries_project_id_category_idx').on(
      table.projectId,
      table.category
    ),
  ]
);

export const characterAffiliationEvents = sqliteTable(
  'character_affiliation_events',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    characterId: text('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
    chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
    boundary: text('boundary', { enum: ['initial', 'chapter_start', 'chapter_end', 'unplaced'] }).notNull(),
    chapterTitleSnapshot: text('chapter_title_snapshot'),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('character_affiliation_events_character_idx').on(table.projectId, table.characterId, table.chapterId),
    uniqueIndex('character_affiliation_events_time_idx').on(table.characterId, table.chapterId, table.boundary),
  ]
);

export const characterAffiliationMembers = sqliteTable(
  'character_affiliation_members',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    eventId: text('event_id').notNull().references(() => characterAffiliationEvents.id, { onDelete: 'cascade' }),
    organizationEntryId: text('organization_entry_id').references(() => worldEntries.id, { onDelete: 'set null' }),
    organizationTitleSnapshot: text('organization_title_snapshot').notNull(),
    position: text('position'),
    isPrimary: integer('is_primary').notNull().default(0),
  },
  (table) => [uniqueIndex('character_affiliation_members_event_org_idx').on(table.eventId, table.organizationEntryId)]
);

export const characterAffiliationAudits = sqliteTable(
  'character_affiliation_audits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    characterId: text('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
    eventId: text('event_id'),
    action: text('action', { enum: ['create', 'update', 'delete'] }).notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [index('character_affiliation_audits_character_idx').on(table.projectId, table.characterId, table.id)]
);

export const characterAffiliationVersions = sqliteTable('character_affiliation_versions', {
  characterId: text('character_id').primaryKey().references(() => characters.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull().default(0),
});

export const chapterEntityReferences = sqliteTable(
  'chapter_entity_references',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
    characterId: text('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    worldEntryId: text('world_entry_id').references(() => worldEntries.id, { onDelete: 'cascade' }),
    presence: text('presence', { enum: ['appears', 'mentioned'] }).notNull().default('appears'),
    displayGroupOverride: text('display_group_override', { enum: ['character', 'location', 'item', 'organization', 'other'] }),
    note: text('note'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('chapter_entity_references_chapter_idx').on(table.projectId, table.chapterId, table.sortOrder),
    uniqueIndex('chapter_entity_references_character_idx').on(table.chapterId, table.characterId),
    uniqueIndex('chapter_entity_references_world_idx').on(table.chapterId, table.worldEntryId),
  ]
);

export const chapterReferenceVersions = sqliteTable('chapter_reference_versions', {
  chapterId: text('chapter_id').primaryKey().references(() => chapters.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull().default(0),
});

// Drafts stay separate from world_entries until the author explicitly approves.
export const worldEntrySuggestions = sqliteTable(
  'world_entry_suggestions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    batchId: text('batch_id').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    tagsJson: text('tags_json').notNull().default('[]'),
    researchJson: text('research_json'),
    sourceIdsJson: text('source_ids_json'),
    reportJson: text('report_json'),
    status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
    approvedEntryId: text('approved_entry_id').references(() => worldEntries.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  },
  (table) => [index('world_suggestions_project_status_idx').on(table.projectId, table.status, table.createdAt)]
);

// ─── World Entry Links ───────────────────────────────────────────────────────

export const worldEntryLinks = sqliteTable(
  'world_entry_links',
  {
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
  },
  (table) => [
    index('world_entry_links_source_id_idx').on(table.sourceId),
    index('world_entry_links_target_id_idx').on(table.targetId),
  ]
);

// ─── World Entry Tags ────────────────────────────────────────────────────────

export const worldEntryTags = sqliteTable(
  'world_entry_tags',
  {
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
  },
  (table) => [
    index('world_entry_tags_entry_id_idx').on(table.entryId),
    index('world_entry_tags_tag_entry_id_idx').on(table.tag, table.entryId),
  ]
);

// ─── AI Provider Settings ────────────────────────────────────────────────────

export const aiProviderSettings = sqliteTable(
  'ai_provider_settings',
  {
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
  },
  (table) => [
    index('ai_provider_settings_project_id_is_default_idx').on(
      table.projectId,
      table.isDefault
    ),
  ]
);

// ─── Plot causality timeline ────────────────────────────────────────────────

export const plotNodes = sqliteTable('plot_nodes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  kind: text('kind', { enum: ['event', 'choice', 'consequence', 'foreshadow', 'reminder', 'payoff', 'reveal', 'state'] }).notNull(),
  status: text('status', { enum: ['draft', 'confirmed'] }).notNull().default('draft'),
  title: text('title').notNull(),
  description: text('description'),
  lane: text('lane'),
  storyYear: integer('story_year'),
  storyMonth: integer('story_month'),
  storyDay: integer('story_day'),
  storyTimeLabel: text('story_time_label'),
  storyDatePrecision: text('story_date_precision', { enum: ['none', 'year', 'month', 'day', 'time', 'relative'] }).notNull().default('none'),
  storyDateLabel: text('story_date_label'),
  evidence: text('evidence'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, table => [
  index('plot_nodes_project_order_idx').on(table.projectId, table.storyYear, table.storyMonth, table.storyDay, table.sortOrder),
  index('plot_nodes_chapter_idx').on(table.projectId, table.chapterId),
]);

export const plotEdges = sqliteTable('plot_edges', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  fromNodeId: text('from_node_id').notNull().references(() => plotNodes.id, { onDelete: 'cascade' }),
  toNodeId: text('to_node_id').notNull().references(() => plotNodes.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['causes', 'enables', 'motivates', 'prevents', 'reveals', 'pays_off'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, table => [
  uniqueIndex('plot_edges_unique_idx').on(table.fromNodeId, table.toNodeId, table.type),
  index('plot_edges_project_idx').on(table.projectId),
]);

export const chapterCloseouts = sqliteTable('chapter_closeouts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  snapshotHash: text('snapshot_hash').notNull(),
  appliedJson: text('applied_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, table => [
  uniqueIndex('chapter_closeouts_snapshot_idx').on(table.chapterId, table.snapshotHash),
  index('chapter_closeouts_project_idx').on(table.projectId, table.chapterId),
]);

/**
 * Optional project-level endpoint for latency-sensitive inline completion.
 * Absence means the project inherits its normal Story provider.
 */
export const ghostAiSettings = sqliteTable('ghost_ai_settings', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  providerType: text('provider_type').notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  modelName: text('model_name').notNull(),
  baseUrl: text('base_url'),
  contextSize: integer('context_size'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── Character Emotions ─────────────────────────────────────────────────────

export const characterEmotions = sqliteTable(
  'character_emotions',
  {
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
  },
  (table) => [
    index('character_emotions_character_id_chapter_id_idx').on(
      table.characterId,
      table.chapterId
    ),
  ]
);

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

// ─── Character Images (Gallery) ──────────────────────────────────────────────

export const characterImages = sqliteTable('character_images', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterId: text('character_id')
    .notNull()
    .references(() => characters.id),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  imagePath: text('image_path').notNull(),
  kind: text('kind').notNull().default('profile'), // profile | full-body | illustration
  prompt: text('prompt'),
  negativePrompt: text('negative_prompt'),
  providerType: text('provider_type'),
  modelName: text('model_name'),
  width: integer('width'),
  height: integer('height'),
  seed: integer('seed'),
  isPrimary: integer('is_primary').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── Image Provider Settings ─────────────────────────────────────────────────

export const imageProviderSettings = sqliteTable('image_provider_settings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id),
  providerType: text('provider_type').notNull().default('diffusers'),
  baseUrl: text('base_url'),
  modelName: text('model_name'),
  isDefault: integer('is_default').default(0),
  defaultWidth: integer('default_width').default(512),
  defaultHeight: integer('default_height').default(512),
  defaultSteps: integer('default_steps').default(20),
  defaultSampler: text('default_sampler').default('Euler a'),
  defaultCfgScale: integer('default_cfg_scale').default(7),
  defaultNegativePrompt: text('default_negative_prompt'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// ─── External GPU / Python Service Endpoints ───────────────────────────────

export const externalServiceSettings = sqliteTable('external_service_settings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').references(() => projects.id, {
    onDelete: 'cascade',
  }),
  serviceType: text('service_type').notNull(),
  baseUrl: text('base_url').notNull(),
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
  projectId: text('project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  sourceDescription: text('source_description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(
    () => new Date()
  ),
});

// Text/settings snapshots only; media, tags and relationship tables are not restored.
export const entityRevisions = sqliteTable('entity_revisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['character', 'world'] }).notNull(),
  entityId: text('entity_id').notNull(),
  characterId: text('character_id').references(() => characters.id, { onDelete: 'cascade' }),
  worldEntryId: text('world_entry_id').references(() => worldEntries.id, { onDelete: 'cascade' }),
  snapshotJson: text('snapshot_json').notNull(),
  reason: text('reason').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => [index('entity_revisions_lookup_idx').on(table.projectId, table.kind, table.entityId, table.id)]);

export const mapFolders = sqliteTable('map_folders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  order: integer('order').notNull().default(0),
}, (table) => [uniqueIndex('map_folders_project_name_idx').on(table.projectId, table.name)]);

export const mapPaletteColors = sqliteTable('map_palette_colors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  color: text('color').notNull(),
  order: integer('order').notNull(),
}, (table) => [uniqueIndex('map_palette_project_color_idx').on(table.projectId, table.color)]);

export const worldMaps = sqliteTable('world_maps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => mapFolders.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  imagePath: text('image_path').notNull(),
  image2xPath: text('image_2x_path').notNull(),
  thumbnailPath: text('thumbnail_path').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => [index('world_maps_project_idx').on(table.projectId)]);

export const mapPins = sqliteTable('map_pins', {
  id: text('id').primaryKey(),
  mapId: text('map_id').notNull().references(() => worldMaps.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['world', 'character', 'terrain'] }).notNull(),
  status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
  flagColor: text('flag_color'),
  worldEntryId: text('world_entry_id').references(() => worldEntries.id, { onDelete: 'cascade' }),
  characterId: text('character_id').references(() => characters.id, { onDelete: 'cascade' }),
  linkedMapId: text('linked_map_id').references(() => worldMaps.id, { onDelete: 'set null' }),
  label: text('label').notNull(),
  x: real('x').notNull(), y: real('y').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => [index('map_pins_map_idx').on(table.mapId)]);

// ─── Author Notebook ────────────────────────────────────────────────────────

export const writingScenes = sqliteTable('writing_scenes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: text('status', { enum: ['draft', 'confirmed'] }).notNull().default('draft'),
  planJson: text('plan_json').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, table => [index('writing_scenes_chapter_idx').on(table.projectId, table.chapterId)]);

export const writingExamples = sqliteTable('writing_examples', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['style', 'edit'] }).notNull(),
  verdict: text('verdict', { enum: ['accepted', 'rejected'] }).notNull(),
  title: text('title').notNull(),
  original: text('original').notNull().default(''),
  replacement: text('replacement').notNull(),
  reason: text('reason').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, table => [index('writing_examples_project_idx').on(table.projectId)]);

export const authorNoteFolders = sqliteTable(
  'author_note_folders',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('author_note_folders_project_name_idx').on(
      table.projectId,
      table.name
    ),
    index('author_note_folders_project_order_idx').on(
      table.projectId,
      table.order
    ),
  ]
);

export const authorNotes = sqliteTable(
  'author_notes',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    folderId: text('folder_id').references(() => authorNoteFolders.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    kind: text('kind', { enum: ['text', 'mindmap'] }).notNull(),
    contentJson: text('content_json').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('author_notes_project_folder_order_idx').on(
      table.projectId,
      table.folderId,
      table.order
    ),
  ]
);

export const authorNoteConversations = sqliteTable('author_note_conversations', {
  noteId: text('note_id').primaryKey().references(() => authorNotes.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull().default(0),
  messagesJson: text('messages_json').notNull().default('[]'),
});

export const authorNoteAssets = sqliteTable(
  'author_note_assets',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    noteId: text('note_id')
      .notNull()
      .references(() => authorNotes.id, { onDelete: 'cascade' }),
    imagePath: text('image_path').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('author_note_assets_note_idx').on(table.noteId)],
);
