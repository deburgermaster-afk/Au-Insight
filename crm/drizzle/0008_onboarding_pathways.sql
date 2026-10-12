CREATE TABLE IF NOT EXISTS "ai_pathways" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"client_id" text NOT NULL,
	"mode" text NOT NULL,
	"source" text NOT NULL,
	"model" text,
	"payload" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN IF NOT EXISTS "services" text[];--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN IF NOT EXISTS "team_size" text;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN IF NOT EXISTS "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "emergency_name" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "emergency_phone" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "policies_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "onboarded_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ai_pathways" ADD CONSTRAINT "ai_pathways_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "ai_pathways" ADD CONSTRAINT "ai_pathways_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
UPDATE "agency_profile" SET "onboarded_at" = now() WHERE "onboarded_at" IS NULL;--> statement-breakpoint
UPDATE "staff_profiles" SET "onboarded_at" = now() WHERE "onboarded_at" IS NULL;