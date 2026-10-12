CREATE TABLE "mail_connections" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"email" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "mail_domain" text;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "mail_domain_id" text;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "mail_domain_status" text;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "mail_domain_records" jsonb;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "mail_domain_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mail_connections" ADD CONSTRAINT "mail_connections_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_connections" ADD CONSTRAINT "mail_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;