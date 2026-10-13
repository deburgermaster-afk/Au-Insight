CREATE TABLE "handovers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"mode" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text,
	"reason" text,
	"note" text,
	"return_on" date,
	"status" text DEFAULT 'active' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_by_name" text,
	"returned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "workflow" jsonb;--> statement-breakpoint
ALTER TABLE "student_applications" ADD COLUMN "transferred_from_id" text;--> statement-breakpoint
ALTER TABLE "student_applications" ADD COLUMN "transfer_reason" text;--> statement-breakpoint
ALTER TABLE "student_applications" ADD COLUMN "release_letter" text DEFAULT 'not_needed' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_applications" ADD COLUMN "coe_number" text;--> statement-breakpoint
ALTER TABLE "student_applications" ADD COLUMN "coe_issued_at" date;--> statement-breakpoint
ALTER TABLE "student_applications" ADD COLUMN "course_start" date;--> statement-breakpoint
ALTER TABLE "student_applications" ADD COLUMN "course_end" date;--> statement-breakpoint
ALTER TABLE "student_applications" ADD COLUMN "aqf_level" integer;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handovers_agency_idx" ON "handovers" USING btree ("agency_id","status");