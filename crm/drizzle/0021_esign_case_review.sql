CREATE TABLE "case_reviews" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"client_id" text NOT NULL,
	"matter_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"stage" text,
	"result" jsonb,
	"error" text,
	"model" text,
	"requested_by" text,
	"requested_by_name" text,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"client_id" text NOT NULL,
	"matter_id" text,
	"title" text NOT NULL,
	"message" text,
	"origin" text NOT NULL,
	"template_key" text,
	"source_document_id" text,
	"source_key" text NOT NULL,
	"source_hash" text NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"fields" jsonb NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_by" text,
	"sent_by_name" text,
	"due_at" date,
	"viewed_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signer_name" text,
	"signer_email" text,
	"signer_ip" text,
	"signer_agent" text,
	"values" jsonb,
	"document_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_reviews" ADD CONSTRAINT "case_reviews_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_reviews" ADD CONSTRAINT "case_reviews_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_reviews" ADD CONSTRAINT "case_reviews_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_requests" ADD CONSTRAINT "sign_requests_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_requests" ADD CONSTRAINT "sign_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sign_requests" ADD CONSTRAINT "sign_requests_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_reviews_client_idx" ON "case_reviews" USING btree ("agency_id","client_id","created_at");--> statement-breakpoint
CREATE INDEX "case_reviews_matter_idx" ON "case_reviews" USING btree ("matter_id","created_at");--> statement-breakpoint
CREATE INDEX "sign_requests_agency_idx" ON "sign_requests" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "sign_requests_client_idx" ON "sign_requests" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "sign_requests_matter_idx" ON "sign_requests" USING btree ("matter_id");