CREATE TYPE "public"."case_event_type" AS ENUM('HISTORICAL_IMPORT', 'CREATED', 'UPDATED', 'STATUS_CHANGED', 'ASSIGNED', 'COMMENT');--> statement-breakpoint
CREATE TYPE "public"."case_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."case_source" AS ENUM('WHATSAPP_HISTORICAL', 'APP');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('NEW', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."case_tile_role" AS ENUM('REQUESTED', 'QUOTED', 'ALTERNATIVE');--> statement-breakpoint
CREATE TYPE "public"."extraction_confidence" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."issue_type" AS ENUM('OUT_OF_STOCK', 'INSUFFICIENT_STOCK', 'COLOR_UNAVAILABLE', 'SIZE_UNAVAILABLE', 'FINISH_UNAVAILABLE', 'MATCHING_TILE_UNAVAILABLE', 'QUALITY_ISSUE', 'DAMAGED_TILE', 'WRONG_TILE', 'WRONG_QUANTITY', 'DELIVERY_DELAY', 'PRICE_ISSUE', 'ALTERNATIVE_REJECTED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."tile_code_type" AS ENUM('FLORZY_ID', 'VENDOR_CODE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SALES', 'MANAGER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid,
	"event_type" "case_event_type" NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_tiles" (
	"case_id" uuid NOT NULL,
	"tile_id" uuid NOT NULL,
	"role" "case_tile_role" DEFAULT 'REQUESTED' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_tiles_case_id_tile_id_pk" PRIMARY KEY("case_id","tile_id")
);
--> statement-breakpoint
CREATE TABLE "critical_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_code" varchar(20),
	"tile_id" uuid,
	"reported_by" uuid,
	"reported_by_name" varchar(200),
	"reported_on" date,
	"issue_type" "issue_type" NOT NULL,
	"secondary_issue_types" "issue_type"[],
	"original_issue_type" text,
	"description" text,
	"requested_tile_name" text,
	"requested_tile_no" text,
	"requested_color" text,
	"requested_size" text,
	"requested_finish" text,
	"competitor_references" text[],
	"required_quantity" numeric(12, 2),
	"required_quantity_text" text,
	"available_quantity" numeric(12, 2),
	"available_quantity_text" text,
	"unit" varchar(40),
	"alternative_tile_id" uuid,
	"alternative_tile_text" text,
	"alternative_accepted" boolean,
	"alternative_accepted_text" text,
	"severity" "case_severity",
	"status" "case_status" DEFAULT 'NEW' NOT NULL,
	"original_status" varchar(60),
	"assigned_to" uuid,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"source" "case_source" DEFAULT 'APP' NOT NULL,
	"source_messages" text,
	"image_evidence" text,
	"reviewer_notes" text,
	"extraction_confidence" "extraction_confidence",
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reasons" text[],
	"import_hash" varchar(64),
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "critical_cases_import_hash_unique" UNIQUE("import_hash")
);
--> statement-breakpoint
CREATE TABLE "tiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tile_no" varchar(100) NOT NULL,
	"code_type" "tile_code_type" DEFAULT 'UNKNOWN' NOT NULL,
	"name" varchar(300),
	"brand" varchar(150),
	"supplier" varchar(150),
	"supplier_code" varchar(100),
	"color" varchar(150),
	"size" varchar(100),
	"finish" varchar(150),
	"current_stock" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiles_tile_no_unique" UNIQUE("tile_no")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"name" varchar(200) NOT NULL,
	"email" varchar(320),
	"role" "user_role" DEFAULT 'SALES' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_critical_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."critical_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_tiles" ADD CONSTRAINT "case_tiles_case_id_critical_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."critical_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_tiles" ADD CONSTRAINT "case_tiles_tile_id_tiles_id_fk" FOREIGN KEY ("tile_id") REFERENCES "public"."tiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critical_cases" ADD CONSTRAINT "critical_cases_tile_id_tiles_id_fk" FOREIGN KEY ("tile_id") REFERENCES "public"."tiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critical_cases" ADD CONSTRAINT "critical_cases_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critical_cases" ADD CONSTRAINT "critical_cases_alternative_tile_id_tiles_id_fk" FOREIGN KEY ("alternative_tile_id") REFERENCES "public"."tiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "critical_cases" ADD CONSTRAINT "critical_cases_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_events_case_id_idx" ON "case_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_events_created_at_idx" ON "case_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "case_events_event_type_idx" ON "case_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "case_tiles_tile_id_idx" ON "case_tiles" USING btree ("tile_id");--> statement-breakpoint
CREATE INDEX "critical_cases_tile_id_idx" ON "critical_cases" USING btree ("tile_id");--> statement-breakpoint
CREATE INDEX "critical_cases_status_idx" ON "critical_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "critical_cases_issue_type_idx" ON "critical_cases" USING btree ("issue_type");--> statement-breakpoint
CREATE INDEX "critical_cases_created_at_idx" ON "critical_cases" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "critical_cases_reported_by_idx" ON "critical_cases" USING btree ("reported_by");--> statement-breakpoint
CREATE INDEX "critical_cases_assigned_to_idx" ON "critical_cases" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "critical_cases_needs_review_idx" ON "critical_cases" USING btree ("needs_review");--> statement-breakpoint
CREATE INDEX "critical_cases_alternative_tile_id_idx" ON "critical_cases" USING btree ("alternative_tile_id");--> statement-breakpoint
CREATE INDEX "critical_cases_case_code_idx" ON "critical_cases" USING btree ("case_code");--> statement-breakpoint
CREATE INDEX "tiles_name_idx" ON "tiles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");