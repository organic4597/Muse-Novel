CREATE TABLE `external_service_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`service_type` text NOT NULL,
	`base_url` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
