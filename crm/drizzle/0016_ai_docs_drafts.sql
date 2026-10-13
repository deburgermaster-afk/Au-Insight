CREATE TABLE "document_checks" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"document_id" text NOT NULL,
	"matter_id" text,
	"status" text DEFAULT 'done' NOT NULL,
	"verdict" text,
	"result" jsonb,
	"error" text,
	"model" text,
	"checked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"matter_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"checks" jsonb,
	"model" text,
	"created_by" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "ai_docs_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "ai_docs_enabled_by" text;--> statement-breakpoint
ALTER TABLE "document_checks" ADD CONSTRAINT "document_checks_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_checks" ADD CONSTRAINT "document_checks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_checks_doc" ON "document_checks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_checks_matter" ON "document_checks" USING btree ("agency_id","matter_id");--> statement-breakpoint
CREATE INDEX "drafts_matter_idx" ON "drafts" USING btree ("agency_id","matter_id");