ALTER TABLE "critical_cases" ADD COLUMN "listing_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "critical_cases" ADD COLUMN "listed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "critical_cases" ADD COLUMN "listed_by" uuid;--> statement-breakpoint
ALTER TABLE "critical_cases" ADD CONSTRAINT "critical_cases_listed_by_users_id_fk" FOREIGN KEY ("listed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- App cases already reported without a tile need listing too. Historical WhatsApp cases are left alone.
UPDATE "critical_cases" SET "listing_required" = true WHERE "source" = 'APP' AND "tile_id" IS NULL;
