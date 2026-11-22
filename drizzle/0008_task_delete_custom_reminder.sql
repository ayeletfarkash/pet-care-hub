CREATE TABLE `dismissed_auto_tasks` (
	`group_id` text NOT NULL,
	`source_key` text NOT NULL,
	PRIMARY KEY(`group_id`, `source_key`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `reminder_rules` ADD `remind_at` text;