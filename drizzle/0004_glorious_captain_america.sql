ALTER TABLE `ai_provider_settings` ADD `context_size` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `lora_path` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `lora_generated_at` integer;