CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`date` text NOT NULL,
	`product` text NOT NULL,
	`quantity` integer NOT NULL,
	`amount` integer NOT NULL,
	`paid` integer NOT NULL,
	`currency` text NOT NULL,
	`note` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_read` text NOT NULL,
	`error` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `status` text DEFAULT 'Не обработан' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `sale_status` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `request` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `remote_snapshot` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `pending` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `sync_error` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE clients SET status = CASE WHEN stage='Отказ' THEN 'Не подходит' WHEN stage IN ('Заказ подтверждён','Завершён') THEN 'Подходит (квал)' WHEN stage IN ('В работе','КП отправлено') THEN 'В обработке' ELSE 'Не обработан' END, sale_status = CASE WHEN stage='Завершён' THEN 'Успешная сделка' WHEN stage IN ('В работе','КП отправлено','Заказ подтверждён') THEN 'В работе' ELSE '' END WHERE external_id IS NULL;
