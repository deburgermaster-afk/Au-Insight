CREATE TABLE "scholarship_awards" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"scholarship_id" text NOT NULL,
	"application_id" text,
	"client_id" text NOT NULL,
	"amount" numeric NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"sign_request_id" text,
	"awarded_by" text,
	"awarded_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scholarships" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"institution_id" text,
	"name" text NOT NULL,
	"kind" text DEFAULT 'percent' NOT NULL,
	"value" numeric NOT NULL,
	"applies_to" text DEFAULT 'first_year' NOT NULL,
	"funding" text DEFAULT 'institution' NOT NULL,
	"eligibility" text,
	"conditions" text,
	"max_awards" integer,
	"closes_at" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tuition_payments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"client_id" text NOT NULL,
	"application_id" text,
	"institution_id" text,
	"invoice_id" text,
	"period" text NOT NULL,
	"kind" text DEFAULT 'tuition' NOT NULL,
	"gross" numeric NOT NULL,
	"scholarship" numeric DEFAULT '0' NOT NULL,
	"amount" numeric NOT NULL,
	"status" text DEFAULT 'billed' NOT NULL,
	"remitted_at" date,
	"remitted_ref" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "partner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "agreement_start" date;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "agreement_ref" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "collects_tuition" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "remit_days" integer;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "bank_details" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "scholarship_awards" ADD CONSTRAINT "scholarship_awards_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_awards" ADD CONSTRAINT "scholarship_awards_scholarship_id_scholarships_id_fk" FOREIGN KEY ("scholarship_id") REFERENCES "public"."scholarships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_awards" ADD CONSTRAINT "scholarship_awards_application_id_student_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarship_awards" ADD CONSTRAINT "scholarship_awards_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_application_id_student_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."student_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scholarship_awards_client_idx" ON "scholarship_awards" USING btree ("agency_id","client_id");--> statement-breakpoint
CREATE INDEX "tuition_payments_agency_idx" ON "tuition_payments" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "tuition_payments_client_idx" ON "tuition_payments" USING btree ("client_id");