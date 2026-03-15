PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
INSERT INTO `__new_loras`("id", "project_id", "name", "file_path", "source_description", "created_at") SELECT "id", "project_id", "name", "file_path", "source_description", "created_at" FROM `loras`;--> statement-breakpoint
DROP TABLE `loras`;--> statement-breakpoint
ALTER TABLE `__new_loras` RENAME TO `loras`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_image_provider_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`provider_type` text DEFAULT 'diffusers' NOT NULL,
	`base_url` text,
	`model_name` text,
	`is_default` integer DEFAULT 0,
	`default_width` integer DEFAULT 512,
	`default_height` integer DEFAULT 512,
	`default_steps` integer DEFAULT 20,
	`default_sampler` text DEFAULT 'Euler a',
	`default_cfg_scale` integer DEFAULT 7,
	`default_negative_prompt` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_image_provider_settings`("id", "project_id", "provider_type", "base_url", "model_name", "is_default", "default_width", "default_height", "default_steps", "default_sampler", "default_cfg_scale", "default_negative_prompt", "created_at", "updated_at") SELECT "id", "project_id", "provider_type", "base_url", "model_name", "is_default", "default_width", "default_height", "default_steps", "default_sampler", "default_cfg_scale", "default_negative_prompt", "created_at", "updated_at" FROM `image_provider_settings`;--> statement-breakpoint
DROP TABLE `image_provider_settings`;--> statement-breakpoint
ALTER TABLE `__new_image_provider_settings` RENAME TO `image_provider_settings`;--> statement-breakpoint
ALTER TABLE `characters` ADD `items_json` text;