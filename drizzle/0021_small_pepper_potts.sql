CREATE TABLE `chapter_entity_references` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`character_id` text,
	`world_entry_id` text,
	`presence` text DEFAULT 'appears' NOT NULL,
	`display_group_override` text,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`world_entry_id`) REFERENCES `world_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chapter_entity_references_chapter_idx` ON `chapter_entity_references` (`project_id`,`chapter_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_entity_references_character_idx` ON `chapter_entity_references` (`chapter_id`,`character_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_entity_references_world_idx` ON `chapter_entity_references` (`chapter_id`,`world_entry_id`);--> statement-breakpoint
CREATE TABLE `chapter_reference_versions` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_affiliation_audits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`character_id` text NOT NULL,
	`event_id` text,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`created_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_affiliation_audits_character_idx` ON `character_affiliation_audits` (`project_id`,`character_id`,`id`);--> statement-breakpoint
CREATE TABLE `character_affiliation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`character_id` text NOT NULL,
	`chapter_id` text,
	`boundary` text NOT NULL,
	`chapter_title_snapshot` text,
	`reason` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `character_affiliation_events_character_idx` ON `character_affiliation_events` (`project_id`,`character_id`,`chapter_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `character_affiliation_events_time_idx` ON `character_affiliation_events` (`character_id`,`chapter_id`,`boundary`);--> statement-breakpoint
CREATE TABLE `character_affiliation_members` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`organization_entry_id` text,
	`organization_title_snapshot` text NOT NULL,
	`position` text,
	`is_primary` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `character_affiliation_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_entry_id`) REFERENCES `world_entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_affiliation_members_event_org_idx` ON `character_affiliation_members` (`event_id`,`organization_entry_id`);--> statement-breakpoint
CREATE TABLE `character_affiliation_versions` (
	`character_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `world_category_traits` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`trait` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `world_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `world_category_traits_category_trait_idx` ON `world_category_traits` (`category_id`,`trait`);