import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PROPERTY_STATUSES, PROPERTY_TYPES } from '../shared';

export const propertyStatus = pgEnum('property_status', PROPERTY_STATUSES);
export const propertyType = pgEnum('property_type', PROPERTY_TYPES);

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  type: propertyType('type').notNull(),
  status: propertyStatus('status').notNull().default('draft'),
  location: jsonb('location').$type<{ address: string; city: string; country: string }>().notNull(),
  valuationUsdCents: integer('valuation_usd_cents').notNull(),
  totalShares: integer('total_shares').notNull(),
  sharePriceUsdCents: integer('share_price_usd_cents').notNull(),
  expectedYieldBps: integer('expected_yield_bps').notNull(),
  tokenContractId: text('token_contract_id'),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PropertyRow = typeof properties.$inferSelect;
