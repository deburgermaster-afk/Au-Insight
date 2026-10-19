CREATE TABLE "occupation_watches" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"client_id" text NOT NULL,
	"anzsco" text NOT NULL,
	"occupation" text NOT NULL,
	"points" integer NOT NULL,
	"subclasses" text[] DEFAULT '{189}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"snapshots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_round_seen" date,
	"last_alert_round" date,
	"last_checked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "occupation_watches" ADD CONSTRAINT "occupation_watches_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occupation_watches" ADD CONSTRAINT "occupation_watches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "occupation_watches_agency_idx" ON "occupation_watches" USING btree ("agency_id","active");--> statement-breakpoint
CREATE INDEX "occupation_watches_client_idx" ON "occupation_watches" USING btree ("client_id");