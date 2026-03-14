CREATE TABLE `writing_style_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`file_path` text,
	`description` text,
	`is_active` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `writing_style_sample` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `writing_style_description` text;