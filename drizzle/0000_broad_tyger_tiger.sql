CREATE TYPE "public"."property_status" AS ENUM('draft', 'pending_review', 'tokenized', 'archived');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('residential', 'commercial', 'mixed_use', 'land');--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "property_type" NOT NULL,
	"status" "property_status" DEFAULT 'draft' NOT NULL,
	"location" jsonb NOT NULL,
	"valuation_usd_cents" integer NOT NULL,
	"total_shares" integer NOT NULL,
	"share_price_usd_cents" integer NOT NULL,
	"expected_yield_bps" integer NOT NULL,
	"token_contract_id" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
