CREATE TABLE "invite_positions" (
	"invitation_id" text PRIMARY KEY NOT NULL,
	"agency_id" text NOT NULL,
	"position" text NOT NULL,
	"marn" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "consumer_guide_at" date;--> statement-breakpoint
ALTER TABLE "matters" ADD COLUMN "agreement_signed_at" date;--> statement-breakpoint
ALTER TABLE "invite_positions" ADD CONSTRAINT "invite_positions_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;