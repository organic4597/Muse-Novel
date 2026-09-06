CREATE INDEX `ai_provider_settings_project_id_is_default_idx` ON `ai_provider_settings` (`project_id`,`is_default`);--> statement-breakpoint
CREATE INDEX `chapters_project_id_order_idx` ON `chapters` (`project_id`,`order`);--> statement-breakpoint
CREATE INDEX `character_emotions_character_id_chapter_id_idx` ON `character_emotions` (`character_id`,`chapter_id`);--> statement-breakpoint
CREATE INDEX `characters_project_id_idx` ON `characters` (`project_id`);--> statement-breakpoint
CREATE INDEX `world_entries_project_id_category_idx` ON `world_entries` (`project_id`,`category`);--> statement-breakpoint
CREATE INDEX `world_entry_links_source_id_idx` ON `world_entry_links` (`source_id`);--> statement-breakpoint
CREATE INDEX `world_entry_links_target_id_idx` ON `world_entry_links` (`target_id`);--> statement-breakpoint
CREATE INDEX `world_entry_tags_entry_id_idx` ON `world_entry_tags` (`entry_id`);--> statement-breakpoint
CREATE INDEX `world_entry_tags_tag_entry_id_idx` ON `world_entry_tags` (`tag`,`entry_id`);