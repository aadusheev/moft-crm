CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text,
	`stage` text NOT NULL,
	`next_action` text NOT NULL,
	`next_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_external_id_unique` ON `clients` (`external_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`type` text NOT NULL,
	`note` text NOT NULL,
	`stage` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
