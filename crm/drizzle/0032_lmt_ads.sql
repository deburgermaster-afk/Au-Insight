CREATE TABLE "lmt_ads" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"nomination_id" text NOT NULL,
	"platform" text NOT NULL,
	"url" text,
	"ad_title" text NOT NULL,
	"published_on" date NOT NULL,
	"ends_on" date,
	"shows_title" boolean DEFAULT true NOT NULL,
	"shows_employer" boolean DEFAULT true NOT NULL,
	"shows_skills" boolean DEFAULT true NOT NULL,
	"shows_salary" boolean DEFAULT false NOT NULL,
	"applicants" integer,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nominations" ADD COLUMN "lmt_exemption" text;--> statement-breakpoint
ALTER TABLE "lmt_ads" ADD CONSTRAINT "lmt_ads_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lmt_ads" ADD CONSTRAINT "lmt_ads_nomination_id_nominations_id_fk" FOREIGN KEY ("nomination_id") REFERENCES "public"."nominations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lmt_ads_nomination_idx" ON "lmt_ads" USING btree ("nomination_id");