CREATE TABLE `notification_preferences` (
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`enabled` integer NOT NULL,
	PRIMARY KEY(`user_id`, `category`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`occurrence_key` text NOT NULL,
	`kind` text DEFAULT 'reminder' NOT NULL,
	`deliver_at` text NOT NULL,
	`params` text NOT NULL,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_once_uq` ON `notifications` (`user_id`,`source_type`,`source_id`,`kind`,`occurrence_key`);--> statement-breakpoint
CREATE INDEX `notifications_user_deliver_idx` ON `notifications` (`user_id`,`deliver_at`);--> statement-breakpoint
CREATE TABLE `reminder_rule_recipients` (
	`rule_id` text NOT NULL,
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	PRIMARY KEY(`rule_id`, `user_id`),
	FOREIGN KEY (`rule_id`) REFERENCES `reminder_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reminder_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`lead_minutes` integer NOT NULL,
	`recipient_mode` text NOT NULL,
	`updated_by_id` text,
	`updated_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_rules_source_uq` ON `reminder_rules` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `reminder_rules_group_idx` ON `reminder_rules` (`group_id`);