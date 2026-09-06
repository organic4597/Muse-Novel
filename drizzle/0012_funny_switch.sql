CREATE TABLE `story_state_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`character_id` text,
	`chapter_id` text,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`previous_value` text,
	`details` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`is_pinned` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `story_state_project_active_pinned_idx` ON `story_state_entries` (`project_id`,`is_active`,`is_pinned`);--> statement-breakpoint
CREATE INDEX `story_state_character_category_idx` ON `story_state_entries` (`character_id`,`category`);--> statement-breakpoint
CREATE INDEX `story_state_chapter_id_idx` ON `story_state_entries` (`chapter_id`);