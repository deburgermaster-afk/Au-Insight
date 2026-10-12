CREATE TABLE "connectors" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"account" text,
	"scope" text,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"connected_by" text,
	"connected_by_name" text,
	"webhook_id" text,
	"webhook_secret" text,
	"usage" jsonb,
	"usage_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"provider" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_provider_redirect_uri_pk" PRIMARY KEY("provider","redirect_uri")
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "mail_domain_via" text;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "mail_usage_alerts" jsonb;--> statement-breakpoint
ALTER TABLE "connectors" ADD CONSTRAINT "connectors_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connectors_agency_kind" ON "connectors" USING btree ("agency_id","kind");