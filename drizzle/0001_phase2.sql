CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`medical_record_id` text NOT NULL,
	`file` text NOT NULL,
	`mime` text NOT NULL,
	`display_name` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medical_record_id`) REFERENCES `medical_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `attachments_record_idx` ON `attachments` (`medical_record_id`);--> statement-breakpoint
CREATE TABLE `event_occurrence_status` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`event_id` text NOT NULL,
	`occurrence` text NOT NULL,
	`status` text NOT NULL,
	`by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_occ_uq` ON `event_occurrence_status` (`event_id`,`occurrence`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`location` text,
	`provider` text,
	`description` text,
	`notes` text,
	`assignee_id` text,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`recurrence_until` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `events_group_start_idx` ON `events` (`group_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `medical_records` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`provider` text,
	`details` text,
	`notes` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `medical_group_date_idx` ON `medical_records` (`group_id`,`date`);--> statement-breakpoint
CREATE TABLE `medication_administrations` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`administered_at` text NOT NULL,
	`administered_by_id` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `medication_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`administered_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `med_admin_plan_dose_uq` ON `medication_administrations` (`plan_id`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `med_admin_group_idx` ON `medication_administrations` (`group_id`);--> statement-breakpoint
CREATE TABLE `medication_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`dosage` text NOT NULL,
	`instructions` text,
	`schedule_type` text NOT NULL,
	`times` text NOT NULL,
	`weekdays` text NOT NULL,
	`interval_days` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`responsible_user_id` text,
	`notes` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `med_plans_group_idx` ON `medication_plans` (`group_id`);--> statement-breakpoint
CREATE TABLE `task_assignees` (
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `user_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_assignees_user_idx` ON `task_assignees` (`user_id`);--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `task_history` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`task_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`meta` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `task_transfer_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`task_id` text NOT NULL,
	`from_user_id` text,
	`to_user_id` text NOT NULL,
	`requested_by_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by_id` text,
	`decided_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_transfer_pending_uq` ON `task_transfer_requests` (`task_id`) WHERE status = 'pending';--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`series_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`due_at` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`completed_at` integer,
	`completed_by_id` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_series_due_uq` ON `tasks` (`series_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `tasks_group_status_due_idx` ON `tasks` (`group_id`,`status`,`due_at`);