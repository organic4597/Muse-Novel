CREATE TABLE `semantic_memory_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_title` text NOT NULL,
	`source_updated_at` integer,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`embedding_json` text,
	`embedding_model` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `semantic_memory_source_chunk_uidx` ON `semantic_memory_chunks` (`project_id`,`source_type`,`source_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `semantic_memory_project_source_idx` ON `semantic_memory_chunks` (`project_id`,`source_type`,`source_id`);