CREATE TABLE "client_segments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_by" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nominations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"employer_id" text NOT NULL,
	"client_id" text,
	"matter_id" text,
	"program" text NOT NULL,
	"position_title" text NOT NULL,
	"anzsco" text,
	"salary" numeric,
	"worksite" text,
	"status" text DEFAULT 'preparing' NOT NULL,
	"trn" text,
	"lodged_at" date,
	"decided_at" date,
	"approval_expires" date,
	"lmt" text DEFAULT 'needed' NOT NULL,
	"assigned_to" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "accounting" jsonb;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "xero_contact_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "application_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "xero_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "xero_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "xero_error" text;--> statement-breakpoint
ALTER TABLE "ledger" ADD COLUMN "xero_id" text;--> statement-breakpoint
ALTER TABLE "client_segments" ADD CONSTRAINT "client_segments_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nominations_agency_idx" ON "nominations" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "nominations_employer_idx" ON "nominations" USING btree ("employer_id");