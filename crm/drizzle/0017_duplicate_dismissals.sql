CREATE TABLE "duplicate_dismissals" (
	"agency_id" text NOT NULL,
	"a" text NOT NULL,
	"b" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_dismissals_agency_id_a_b_pk" PRIMARY KEY("agency_id","a","b")
);
--> statement-breakpoint
ALTER TABLE "duplicate_dismissals" ADD CONSTRAINT "duplicate_dismissals_agency_id_organization_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;