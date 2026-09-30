CREATE SEQUENCE "public"."critical_case_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 115 CACHE 1;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "team" varchar(100);--> statement-breakpoint
-- Move the sequence past the highest existing CC-number (historical cases are CC-001..CC-114).
SELECT setval('"public"."critical_case_code_seq"', GREATEST(114, COALESCE((SELECT max(substring(case_code FROM 4)::int) FROM critical_cases WHERE case_code ~ '^CC-[0-9]+$'), 0)), true);
