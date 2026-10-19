CREATE TABLE "reminder_log" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"period" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"employer_id" text NOT NULL,
	"client_id" text,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"notify_by" date NOT NULL,
	"notified_on" date,
	"reference" text,
	"notes" text,
	"task_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "key_dates" jsonb;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_events" ADD CONSTRAINT "sponsor_events_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_events" ADD CONSTRAINT "sponsor_events_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_events" ADD CONSTRAINT "sponsor_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_log_unique" ON "reminder_log" USING btree ("kind","ref_id","period");--> statement-breakpoint
CREATE INDEX "sponsor_events_employer_idx" ON "sponsor_events" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "sponsor_events_agency_idx" ON "sponsor_events" USING btree ("agency_id","notified_on");