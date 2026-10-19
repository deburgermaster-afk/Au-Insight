ALTER TABLE "tasks" ADD COLUMN "repeat" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "repeat_until" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "next_task_id" text;