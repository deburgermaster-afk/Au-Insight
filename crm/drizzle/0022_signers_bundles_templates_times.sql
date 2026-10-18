CREATE TABLE "consent_template_overrides" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"key" text NOT NULL,
	"custom" boolean DEFAULT false NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"group" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"checkboxes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text_field" jsonb,
	"initials" boolean DEFAULT false NOT NULL,
	"countersign" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_times" (
	"subclass" text NOT NULL,
	"stream" text DEFAULT '' NOT NULL,
	"visa_name" text,
	"p50" text,
	"p90" text,
	"p50_days" integer,
	"p90_days" integer,
	"as_at" date,
	"source_url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_times_subclass_stream_pk" PRIMARY KEY("subclass","stream")
);
--> statement-breakpoint
ALTER TABLE "sign_requests" ADD COLUMN "signers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sign_requests" ADD COLUMN "bundle" jsonb;--> statement-breakpoint
ALTER TABLE "sign_requests" ADD COLUMN "invoice_id" text;--> statement-breakpoint
ALTER TABLE "consent_template_overrides" ADD CONSTRAINT "consent_template_overrides_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_template_overrides_key" ON "consent_template_overrides" USING btree ("agency_id","key");