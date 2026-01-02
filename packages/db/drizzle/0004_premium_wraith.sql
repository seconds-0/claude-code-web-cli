CREATE TABLE "cost_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"user_id" uuid,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"server_type" text,
	"size_gb" integer,
	"event_type" text NOT NULL,
	"hourly_rate" numeric(10, 6) NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"workspace_id" uuid,
	"user_id" uuid,
	"server_hours" numeric(10, 4) DEFAULT '0',
	"server_cost" numeric(10, 4) DEFAULT '0',
	"volume_gb_hours" numeric(10, 4) DEFAULT '0',
	"volume_cost" numeric(10, 4) DEFAULT '0',
	"total_cost" numeric(10, 4) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_snapshots" ADD CONSTRAINT "cost_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_snapshots" ADD CONSTRAINT "cost_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_events_workspace_id_idx" ON "cost_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cost_events_user_id_idx" ON "cost_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cost_events_timestamp_idx" ON "cost_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "cost_events_resource_idx" ON "cost_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "cost_snapshots_date_idx" ON "cost_snapshots" USING btree ("date");--> statement-breakpoint
CREATE INDEX "cost_snapshots_workspace_id_idx" ON "cost_snapshots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "cost_snapshots_user_id_idx" ON "cost_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_snapshots_date_workspace_idx" ON "cost_snapshots" USING btree ("date","workspace_id");