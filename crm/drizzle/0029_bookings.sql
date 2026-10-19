CREATE TABLE "booking_types" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"minutes" integer DEFAULT 30 NOT NULL,
	"fee" numeric,
	"mode" text DEFAULT 'video' NOT NULL,
	"staff_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"video_link" text,
	"buffer_minutes" integer DEFAULT 10 NOT NULL,
	"min_notice_hours" integer DEFAULT 12 NOT NULL,
	"max_days_ahead" integer DEFAULT 45 NOT NULL,
	"invoice_on_booking" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_feeds" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"agency_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feeds_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "booking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_profile" ADD COLUMN "booking_hours" jsonb;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "status" text DEFAULT 'booked' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "source" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "booking_type_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "manage_token_hash" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_types" ADD CONSTRAINT "booking_types_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_types_agency_slug" ON "booking_types" USING btree ("agency_id","slug");