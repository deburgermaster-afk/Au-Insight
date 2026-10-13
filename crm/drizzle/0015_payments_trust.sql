CREATE TABLE "payment_attempts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"client_id" text NOT NULL,
	"provider" text NOT NULL,
	"amount" numeric NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_id" text,
	"checkout_url" text,
	"proof_key" text,
	"proof_name" text,
	"client_note" text,
	"reviewed_by" text,
	"reviewed_by_name" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"ledger_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_providers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"account" text,
	"secrets" text,
	"settings" jsonb,
	"connected_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_reconciliations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"period_end" date NOT NULL,
	"bank_balance" numeric NOT NULL,
	"cashbook_balance" numeric NOT NULL,
	"client_total" numeric NOT NULL,
	"difference" numeric NOT NULL,
	"notes" text,
	"reconciled_by" text,
	"reconciled_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "bank_transfer_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "payments_account" text DEFAULT 'trust' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "zeller_link" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_providers" ADD CONSTRAINT "payment_providers_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_reconciliations" ADD CONSTRAINT "trust_reconciliations_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_attempts_invoice_idx" ON "payment_attempts" USING btree ("agency_id","invoice_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_status_idx" ON "payment_attempts" USING btree ("agency_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_providers_agency_provider" ON "payment_providers" USING btree ("agency_id","provider");