CREATE TABLE `author_note_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`note_id` text NOT NULL,
	`image_path` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `author_notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `author_note_assets_note_idx` ON `author_note_assets` (`note_id`);--> statement-breakpoint
CREATE TABLE `author_note_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `author_note_folders_project_name_idx` ON `author_note_folders` (`project_id`,`name`);--> statement-breakpoint
CREATE INDEX `author_note_folders_project_order_idx` ON `author_note_folders` (`project_id`,`order`);--> statement-breakpoint
CREATE TABLE `author_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`folder_id` text,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`content_json` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `author_note_folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `author_notes_project_folder_order_idx` ON `author_notes` (`project_id`,`folder_id`,`order`);