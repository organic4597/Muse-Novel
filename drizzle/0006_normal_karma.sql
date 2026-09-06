CREATE TABLE `character_images` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`project_id` text NOT NULL,
	`image_path` text NOT NULL,
	`kind` text DEFAULT 'profile' NOT NULL,
	`prompt` text,
	`negative_prompt` text,
	`provider_type` text,
	`model_name` text,
	`width` integer,
	`height` integer,
	`seed` integer,
	`is_primary` integer DEFAULT 0,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `image_provider_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`provider_type` text DEFAULT 'automatic1111' NOT NULL,
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
