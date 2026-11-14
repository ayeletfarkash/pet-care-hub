CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`type` text NOT NULL,
	`unit` text,
	`quantity` real DEFAULT 0 NOT NULL,
	`package_size` real,
	`daily_usage` real,
	`low_stock_threshold` real,
	`vendor` text,
	`price` real,
	`purchase_date` text,
	`medication_plan_id` text,
	`notes` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`medication_plan_id`) REFERENCES `medication_plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `inventory_group_idx` ON `inventory_items` (`group_id`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`delta` real NOT NULL,
	`quantity_after` real NOT NULL,
	`order_id` text,
	`by_user_id` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `movements_item_idx` ON `inventory_movements` (`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `movements_order_uq` ON `inventory_movements` (`order_id`) WHERE order_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`product` text NOT NULL,
	`item_id` text,
	`vendor` text,
	`url` text,
	`order_date` text NOT NULL,
	`expected_delivery` text,
	`price` real,
	`quantity` real,
	`status` text DEFAULT 'ordered' NOT NULL,
	`delivered_at` text,
	`notes` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `orders_group_date_idx` ON `orders` (`group_id`,`order_date`);--> statement-breakpoint
CREATE TABLE `routine_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`scheduled_for` text,
	`status` text NOT NULL,
	`at` text NOT NULL,
	`by_user_id` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_logs_occ_uq` ON `routine_logs` (`routine_id`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `routine_logs_group_idx` ON `routine_logs` (`group_id`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`schedule_type` text NOT NULL,
	`times` text NOT NULL,
	`weekdays` text NOT NULL,
	`interval_days` integer,
	`start_date` text NOT NULL,
	`end_date` text,
	`responsible_user_id` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `routines_group_idx` ON `routines` (`group_id`);