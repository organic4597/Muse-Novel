CREATE TABLE `chapter_closeouts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`applied_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapter_closeouts_snapshot_idx` ON `chapter_closeouts` (`chapter_id`,`snapshot_hash`);--> statement-breakpoint
CREATE INDEX `chapter_closeouts_project_idx` ON `chapter_closeouts` (`project_id`,`chapter_id`);--> statement-breakpoint
CREATE TABLE `plot_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`from_node_id` text NOT NULL,
	`to_node_id` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_node_id`) REFERENCES `plot_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_node_id`) REFERENCES `plot_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plot_edges_unique_idx` ON `plot_edges` (`from_node_id`,`to_node_id`,`type`);--> statement-breakpoint
CREATE INDEX `plot_edges_project_idx` ON `plot_edges` (`project_id`);--> statement-breakpoint
CREATE TABLE `plot_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`chapter_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`lane` text,
	`story_year` integer,
	`story_month` integer,
	`story_day` integer,
	`story_time_label` text,
	`story_date_precision` text DEFAULT 'none' NOT NULL,
	`story_date_label` text,
	`evidence` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plot_nodes_project_order_idx` ON `plot_nodes` (`project_id`,`story_year`,`story_month`,`story_day`,`sort_order`);--> statement-breakpoint
CREATE INDEX `plot_nodes_chapter_idx` ON `plot_nodes` (`project_id`,`chapter_id`);--> statement-breakpoint
ALTER TABLE `chapters` ADD `story_year` integer;--> statement-breakpoint
ALTER TABLE `chapters` ADD `story_month` integer;--> statement-breakpoint
ALTER TABLE `chapters` ADD `story_day` integer;--> statement-breakpoint
ALTER TABLE `chapters` ADD `story_time_label` text;--> statement-breakpoint
ALTER TABLE `chapters` ADD `story_date_precision` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `chapters` ADD `story_date_label` text;--> statement-breakpoint
ALTER TABLE `story_state_entries` ADD `end_chapter_id` text REFERENCES chapters(id);--> statement-breakpoint
ALTER TABLE `story_state_entries` ADD `world_entry_id` text;--> statement-breakpoint
ALTER TABLE `story_state_entries` ADD `knowledge_scope` text DEFAULT 'canon' NOT NULL;--> statement-breakpoint
ALTER TABLE `story_state_entries` ADD `knower_character_id` text REFERENCES characters(id);--> statement-breakpoint
ALTER TABLE `story_state_entries` ADD `certainty` text DEFAULT 'known' NOT NULL;--> statement-breakpoint
ALTER TABLE `story_state_entries` ADD `evidence` text;--> statement-breakpoint
CREATE INDEX `story_state_time_range_idx` ON `story_state_entries` (`project_id`,`chapter_id`,`end_chapter_id`);--> statement-breakpoint
CREATE INDEX `story_state_knowledge_idx` ON `story_state_entries` (`project_id`,`knowledge_scope`,`knower_character_id`);