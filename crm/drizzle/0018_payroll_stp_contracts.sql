CREATE TABLE "contract_templates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"name" text NOT NULL,
	"employment" text DEFAULT 'full_time' NOT NULL,
	"body" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"analysis" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employment_contracts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"user_id" text NOT NULL,
	"template_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"hash" text,
	"sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signed_name" text,
	"signed_ip" text,
	"signed_agent" text,
	"pdf_key" text,
	"created_by" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_settings" (
	"agency_id" text PRIMARY KEY NOT NULL,
	"branch" text DEFAULT '001' NOT NULL,
	"bms_id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"address_line1" text,
	"suburb" text,
	"address_state" text,
	"postcode" text,
	"frequency" text DEFAULT 'fortnightly' NOT NULL,
	"period_start" date,
	"pay_lag_days" integer DEFAULT 2 NOT NULL,
	"default_fund_name" text,
	"default_fund_usi" text,
	"default_fund_abn" text,
	"clearing_house" text,
	"whm_registered" boolean DEFAULT false NOT NULL,
	"award_code" text,
	"award_name" text,
	"stp_via" text DEFAULT 'file' NOT NULL,
	"stp_declaration_name" text,
	"expense_account" text DEFAULT 'Wages and salaries' NOT NULL,
	"super_expense_account" text DEFAULT 'Superannuation' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stp_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"kind" text NOT NULL,
	"pay_run_id" text,
	"financial_year" text NOT NULL,
	"submission_id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"via" text,
	"payload" jsonb NOT NULL,
	"problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payees" integer DEFAULT 0 NOT NULL,
	"gross" numeric DEFAULT '0' NOT NULL,
	"tax" numeric DEFAULT '0' NOT NULL,
	"receipt" text,
	"response" text,
	"lodged_at" timestamp with time zone,
	"lodged_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_contributions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"pay_run_id" text NOT NULL,
	"payslip_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"fund" jsonb NOT NULL,
	"sg" numeric NOT NULL,
	"sacrifice" numeric DEFAULT '0' NOT NULL,
	"extra" numeric DEFAULT '0' NOT NULL,
	"pay_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"reference" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "extras" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "stsl" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "qualifying" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "salary_sacrifice" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "deductions" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "tax_scale" text;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "tax_treatment" text;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "super_due" date;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "notes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "emergency_relation" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "given_name" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "middle_name" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "dob" date;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "personal_email" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "address_line1" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "address_line2" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "suburb" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "address_state" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "postcode" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "country" text DEFAULT 'AU';--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "tfn_enc" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "tfn_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "residency" text DEFAULT 'resident' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "stsl" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "medicare_exemption" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "extra_withholding" numeric;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "tfn_declared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "income_type" text DEFAULT 'SAW' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "home_country" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "pay_frequency" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "cessation_type" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "award_code" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "award_name" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "classification" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "classification_rate" numeric;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "payroll_id" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "super_type" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "super_usi" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "super_abn" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "super_member" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "smsf_esa" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "smsf_bsb" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "smsf_account" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "smsf_account_name" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "salary_sacrifice_super" numeric;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "extra_super_rate" numeric;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "super_choice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "bank_account_name" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "external_ids" jsonb;--> statement-breakpoint
ALTER TABLE "contract_templates" ADD CONSTRAINT "contract_templates_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stp_events" ADD CONSTRAINT "stp_events_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_contributions" ADD CONSTRAINT "super_contributions_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_contributions" ADD CONSTRAINT "super_contributions_pay_run_id_pay_runs_id_fk" FOREIGN KEY ("pay_run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employment_contracts_user_idx" ON "employment_contracts" USING btree ("agency_id","user_id");--> statement-breakpoint
CREATE INDEX "stp_events_agency_idx" ON "stp_events" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "super_contrib_agency_idx" ON "super_contributions" USING btree ("agency_id","status");