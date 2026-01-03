CREATE TABLE "billing_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"alert_type" text NOT NULL,
	"resource_type" text,
	"message" text NOT NULL,
	"metadata" text,
	"billing_period_start" timestamp with time zone NOT NULL,
	"email_sent" boolean DEFAULT false,
	"email_sent_at" timestamp with time zone,
	"in_app_dismissed" boolean DEFAULT false,
	"in_app_dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "processed_webhooks_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"overages_enabled" boolean DEFAULT false NOT NULL,
	"overages_enabled_at" timestamp with time zone,
	"overages_payment_method_id" text,
	"compute_minutes_limit" integer,
	"storage_gb_limit" integer,
	"voice_seconds_limit" integer,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid,
	"event_type" text NOT NULL,
	"quantity" numeric(12, 6) NOT NULL,
	"billing_period_start" timestamp with time zone NOT NULL,
	"billing_period_end" timestamp with time zone NOT NULL,
	"stripe_meter_event_id" text,
	"stripe_sync_status" text DEFAULT 'pending' NOT NULL,
	"stripe_sync_attempts" integer DEFAULT 0 NOT NULL,
	"stripe_sync_error" text,
	"stripe_synced_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "usage_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "billing_alerts" ADD CONSTRAINT "billing_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_alerts_user_idx" ON "billing_alerts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_alerts_unique_idx" ON "billing_alerts" USING btree ("user_id","alert_type","resource_type","billing_period_start");--> statement-breakpoint
CREATE INDEX "processed_webhooks_expires_idx" ON "processed_webhooks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_period_end_idx" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "usage_events_user_period_idx" ON "usage_events" USING btree ("user_id","billing_period_start","billing_period_end");--> statement-breakpoint
CREATE INDEX "usage_events_workspace_idx" ON "usage_events" USING btree ("workspace_id","recorded_at");--> statement-breakpoint
CREATE INDEX "usage_events_type_period_idx" ON "usage_events" USING btree ("event_type","billing_period_start");--> statement-breakpoint
CREATE INDEX "usage_events_stripe_pending_idx" ON "usage_events" USING btree ("stripe_sync_status");