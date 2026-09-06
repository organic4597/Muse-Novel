CREATE TABLE `character_emotions` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`chapter_id` text NOT NULL,
	`emotion` text NOT NULL,
	`note` text,
	`created_at` integer,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE no action
);
