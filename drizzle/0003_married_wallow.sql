PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_writing_style_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`file_path` text,
	`description` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_writing_style_profiles`("id", "project_id", "name", "file_path", "description", "created_at", "updated_at") SELECT "id", "project_id", "name", "file_path", "description", "created_at", "updated_at" FROM `writing_style_profiles`;--> statement-breakpoint
DROP TABLE `writing_style_profiles`;--> statement-breakpoint
ALTER TABLE `__new_writing_style_profiles` RENAME TO `writing_style_profiles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `projects` ADD `active_writing_style_profile_id` text;