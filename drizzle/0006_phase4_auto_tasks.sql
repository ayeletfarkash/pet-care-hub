ALTER TABLE `events` ADD `auto_prep` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `auto_followup` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `source_type` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `source_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `source_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_source_key_uq` ON `tasks` (`group_id`,`source_key`) WHERE source_key IS NOT NULL;