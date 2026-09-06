PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_loras` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`file_path` text NOT NULL,
	`source_description` text,
	`created_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_loras` (`id`, `project_id`, `name`, `file_path`, `source_description`, `created_at`)
SELECT `id`, `project_id`, `name`, `file_path`, `source_description`, `created_at`
FROM `loras`;
--> statement-breakpoint
DROP TABLE `loras`;
--> statement-breakpoint
ALTER TABLE `__new_loras` RENAME TO `loras`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;