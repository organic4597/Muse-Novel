CREATE TABLE `author_note_conversations` (
	`note_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`messages_json` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `author_notes`(`id`) ON UPDATE no action ON DELETE cascade
);
