import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PROPERTY_STATUSES, PROPERTY_TYPES } from '../shared';

export const propertyStatus = pgEnum('property_status', PROPERTY_STATUSES);
export const propertyType = pgEnum('property_type', PROPERTY_TYPES);

export const userRole = pgEnum('user_role', ['investor', 'operator']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  publicKey: text('public_key').notNull().unique(),
  role: userRole('role').notNull().default('investor'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const KYC_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const kycStatus = pgEnum('kyc_status', KYC_STATUSES);

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

export const kycSubmissions = pgTable('kyc_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  status: kycStatus('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PropertyRow = typeof properties.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type KycSubmissionRow = typeof kycSubmissions.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
