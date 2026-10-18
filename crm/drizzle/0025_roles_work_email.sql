CREATE TABLE "agency_roles" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#6d5efc' NOT NULL,
	"caps" text[] NOT NULL,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_positions" ADD COLUMN "role_id" text;--> statement-breakpoint
ALTER TABLE "invite_positions" ADD COLUMN "work_email" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "role_id" text;--> statement-breakpoint
ALTER TABLE "agency_roles" ADD CONSTRAINT "agency_roles_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;