CREATE TABLE "lodgement_signoffs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"matter_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"requested_by_name" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"reviewer_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_note" text,
	"decision_note" text,
	"fingerprint" text,
	"blocking_at_request" integer,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "require_signoff" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "review_due_at" date;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "review_basis" jsonb;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "review_lodged_at" date;--> statement-breakpoint
ALTER TABLE "lodgement_signoffs" ADD CONSTRAINT "lodgement_signoffs_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodgement_signoffs" ADD CONSTRAINT "lodgement_signoffs_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signoffs_matter_idx" ON "lodgement_signoffs" USING btree ("agency_id","matter_id");--> statement-breakpoint
CREATE INDEX "signoffs_reviewer_idx" ON "lodgement_signoffs" USING btree ("agency_id","reviewer_id","status");