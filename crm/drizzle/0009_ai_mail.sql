CREATE TABLE "mail_insights" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"message_id" text NOT NULL,
	"client_id" text,
	"matter_id" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" text DEFAULT 'none' NOT NULL,
	"action_label" text,
	"action_due" date,
	"action_status" text DEFAULT 'open' NOT NULL,
	"action_by" text,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"matched_by" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "ai_mail_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "ai_mail_enabled_by" text;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "ai_tracking" boolean;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "ai_tracking_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "ai_tracking_by" text;--> statement-breakpoint
ALTER TABLE "mail_insights" ADD CONSTRAINT "mail_insights_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_insights" ADD CONSTRAINT "mail_insights_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_insights" ADD CONSTRAINT "mail_insights_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_insights" ADD CONSTRAINT "mail_insights_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_insights_client_idx" ON "mail_insights" USING btree ("agency_id","client_id","created_at");