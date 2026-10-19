// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const clients = sqliteTable('clients', {
 id: text('id').primaryKey(), name:text('name').notNull(), contact:text('contact').notNull(),
 source:text('source').notNull(), externalId:text('external_id').unique(), stage:text('stage').notNull(),
 nextAction:text('next_action').notNull(), nextDate:text('next_date').notNull(),
 createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull(), version:integer('version').notNull().default(0),
 status:text('status').notNull().default('Не обработан'), saleStatus:text('sale_status').notNull().default(''), notes:text('notes').notNull().default(''),
 request:text('request').notNull().default(''), remoteSnapshot:text('remote_snapshot').notNull().default(''), pending:integer('pending').notNull().default(0), syncError:text('sync_error').notNull().default(''),
});
export const sales = sqliteTable('sales', {
 id:text('id').primaryKey(),clientId:text('client_id').notNull(),date:text('date').notNull(),product:text('product').notNull(),quantity:integer('quantity').notNull(),amount:integer('amount').notNull(),paid:integer('paid').notNull(),currency:text('currency').notNull(),note:text('note').notNull(),actor:text('actor').notNull(),createdAt:text('created_at').notNull(),
});
export const syncState = sqliteTable('sync_state',{id:text('id').primaryKey(),lastRead:text('last_read').notNull(),error:text('error').notNull()});
export const events = sqliteTable('events', {
 id:text('id').primaryKey(), clientId:text('client_id').notNull(), type:text('type').notNull(),
 note:text('note').notNull(), stage:text('stage').notNull(), amount:integer('amount').notNull().default(0),
 currency:text('currency').notNull(), actor:text('actor').notNull(), createdAt:text('created_at').notNull(),
});

export const sourceSettings = sqliteTable('source_settings', {
 id:text('id').primaryKey(),bridgeUrl:text('bridge_url').notNull(),secretCipher:text('secret_cipher').notNull(),
 enabled:integer('enabled').notNull().default(1),revision:integer('revision').notNull().default(1),
 lastChecked:text('last_checked').notNull(),updatedBy:text('updated_by').notNull(),
});
