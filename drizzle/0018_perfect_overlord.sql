CREATE TABLE `map_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `map_folders_project_name_idx` ON `map_folders` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `map_pins` (
	`id` text PRIMARY KEY NOT NULL,
	`map_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`world_entry_id` text,
	`character_id` text,
	`linked_map_id` text,
	`label` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `world_maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`world_entry_id`) REFERENCES `world_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_map_id`) REFERENCES `world_maps`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `map_pins_map_idx` ON `map_pins` (`map_id`);--> statement-breakpoint
CREATE TABLE `world_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`folder_id` text,
	`name` text NOT NULL,
	`image_path` text NOT NULL,
	`image_2x_path` text NOT NULL,
	`thumbnail_path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `map_folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `world_maps_project_idx` ON `world_maps` (`project_id`);