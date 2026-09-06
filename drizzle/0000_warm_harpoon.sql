CREATE TABLE `ai_provider_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`provider_type` text NOT NULL,
	`api_key_encrypted` text,
	`model_name` text,
	`base_url` text,
	`is_default` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`order` integer NOT NULL,
	`content_json` text,
	`outline` text,
	`summary` text,
	`memo` text,
	`word_count` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `character_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`character_a_id` text NOT NULL,
	`character_b_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`description` text,
	`created_at` integer,
	FOREIGN KEY (`character_a_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`character_b_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`appearance` text,
	`personality` text,
	`backstory` text,
	`arc_description` text,
	`image_path` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`genre` text,
	`synopsis` text,
	`settings_json` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `world_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `world_entry_links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `world_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `world_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `world_entry_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`entry_id`) REFERENCES `world_entries`(`id`) ON UPDATE no action ON DELETE no action
);
