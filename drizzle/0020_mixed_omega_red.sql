CREATE TABLE `map_palette_colors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`color` text NOT NULL,
	`order` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `map_palette_project_color_idx` ON `map_palette_colors` (`project_id`,`color`);