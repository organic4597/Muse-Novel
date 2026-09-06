CREATE TABLE `world_entry_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`research_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_entry_id` text,
	`created_at` integer,
	`reviewed_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_entry_id`) REFERENCES `world_entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `world_suggestions_project_status_idx` ON `world_entry_suggestions` (`project_id`,`status`,`created_at`);