CREATE TABLE `entity_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`character_id` text,
	`world_entry_id` text,
	`snapshot_json` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`world_entry_id`) REFERENCES `world_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entity_revisions_lookup_idx` ON `entity_revisions` (`project_id`,`kind`,`entity_id`,`id`);