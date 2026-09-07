CREATE TABLE `ghost_ai_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`provider_type` text NOT NULL,
	`api_key_encrypted` text,
	`model_name` text NOT NULL,
	`base_url` text,
	`context_size` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
