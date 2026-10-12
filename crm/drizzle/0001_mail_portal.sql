CREATE TABLE "mailboxes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"address" text NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"kind" text DEFAULT 'personal' NOT NULL,
	"signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mailboxes_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "portal_links" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"token" text NOT NULL,
	"matter_id" text NOT NULL,
	"client_id" text NOT NULL,
	"note" text,
	"due_at" date,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "checklist_item_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bcc_addresses" text[];--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "auth" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;