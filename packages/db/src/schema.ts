import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  uniqueIndex,
  boolean,
  numeric,
  date,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").unique().notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Workspaces table (1:N with user - users can have multiple workspaces)
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("default"),
  status: text("status").notNull().default("pending"), // pending, provisioning, ready, suspended, error
  // Private mode: Tailscale-only networking (more secure but ~300ms higher latency)
  // When false (default): Direct connect enabled for low-latency terminal access
  privateMode: boolean("private_mode").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Workspace volumes (1:1 with workspace)
export const workspaceVolumes = pgTable(
  "workspace_volumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hetznerVolumeId: text("hetzner_volume_id"),
    sizeGb: integer("size_gb").notNull().default(50),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("workspace_volumes_workspace_id_idx").on(table.workspaceId)]
);

// Workspace instances (VMs) - 1:1 with workspace (only one active instance per workspace)
export const workspaceInstances = pgTable(
  "workspace_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hetznerServerId: text("hetzner_server_id"),
    serverType: text("server_type"), // cpx11, cpx21, etc. - persisted for accurate cost tracking
    tailscaleIp: text("tailscale_ip"),
    publicIp: text("public_ip"),
    status: text("status").notNull().default("pending"), // pending, starting, running, stopping, stopped
    startedAt: timestamp("started_at"),
    stoppedAt: timestamp("stopped_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("workspace_instances_workspace_id_idx").on(table.workspaceId)]
);

// Sessions (tmux sessions)
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  tmuxSessionName: text("tmux_session_name").notNull(),
  mode: text("mode").notNull().default("engineer"), // engineer, guided
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Previews
export const previews = pgTable("previews", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  port: integer("port").notNull(),
  publicUrl: text("public_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Anthropic OAuth credentials (encrypted at rest)
// Stores Claude Code OAuth tokens for pre-authentication
export const anthropicCredentials = pgTable("anthropic_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(), // One credential set per user
  // Encrypted token blob containing accessToken, refreshToken, expiresAt, scopes
  encryptedTokens: text("encrypted_tokens").notNull(),
  // Initialization vector for AES-GCM decryption
  encryptionIv: text("encryption_iv").notNull(),
  // Token expiry for refresh scheduling (not encrypted - needed for queries)
  expiresAt: timestamp("expires_at"),
  // Status: valid, expired, revoked, error
  status: text("status").notNull().default("valid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Cost tracking events (event sourcing for Hetzner resource usage)
export const costEvents = pgTable(
  "cost_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    resourceType: text("resource_type").notNull(), // 'server' | 'volume'
    resourceId: text("resource_id").notNull(), // hetzner server/volume ID
    serverType: text("server_type"), // cpx11, cpx21, etc. (for servers)
    sizeGb: integer("size_gb"), // for volumes
    eventType: text("event_type").notNull(), // 'start' | 'stop' | 'create' | 'delete'
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 6 }).notNull(), // cost per hour in EUR
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (table) => [
    index("cost_events_workspace_id_idx").on(table.workspaceId),
    index("cost_events_user_id_idx").on(table.userId),
    index("cost_events_timestamp_idx").on(table.timestamp),
    index("cost_events_resource_idx").on(table.resourceType, table.resourceId),
  ]
);

// Cost snapshots (daily aggregates for historical reporting)
export const costSnapshots = pgTable(
  "cost_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    serverHours: numeric("server_hours", { precision: 10, scale: 4 }).default("0"),
    serverCost: numeric("server_cost", { precision: 10, scale: 4 }).default("0"),
    volumeGbHours: numeric("volume_gb_hours", { precision: 10, scale: 4 }).default("0"),
    volumeCost: numeric("volume_cost", { precision: 10, scale: 4 }).default("0"),
    totalCost: numeric("total_cost", { precision: 10, scale: 4 }).default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("cost_snapshots_date_idx").on(table.date),
    index("cost_snapshots_workspace_id_idx").on(table.workspaceId),
    index("cost_snapshots_user_id_idx").on(table.userId),
    uniqueIndex("cost_snapshots_date_workspace_idx").on(table.date, table.workspaceId),
  ]
);

// ============================================================================
// BILLING SYSTEM TABLES
// ============================================================================

// Subscriptions table (Stripe subscription state)
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),

    // Stripe identifiers
    stripeCustomerId: text("stripe_customer_id").notNull().unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),

    // Plan configuration (synced from Stripe price ID mapping)
    plan: text("plan").notNull().default("free"), // free, starter, pro, unlimited, usage_based
    status: text("status").notNull().default("active"), // active, past_due, canceled, paused, trialing, incomplete

    // Overage settings (explicit opt-in)
    overagesEnabled: boolean("overages_enabled").notNull().default(false),
    overagesEnabledAt: timestamp("overages_enabled_at", { withTimezone: true }),
    overagesPaymentMethodId: text("overages_payment_method_id"),

    // Plan limits (NULL = unlimited, copied from PLAN_CONFIGS on sync)
    computeMinutesLimit: integer("compute_minutes_limit"),
    storageGbLimit: integer("storage_gb_limit"),
    voiceSecondsLimit: integer("voice_seconds_limit"),

    // Billing period (from Stripe, or virtual for free)
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
  },
  (table) => [
    index("subscriptions_user_id_idx").on(table.userId),
    index("subscriptions_stripe_customer_id_idx").on(table.stripeCustomerId),
    index("subscriptions_status_idx").on(table.status),
    index("subscriptions_period_end_idx").on(table.currentPeriodEnd),
  ]
);

// Usage events (immutable event log for billing)
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Relationships
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),

    // Event details
    eventType: text("event_type").notNull(), // compute_minute, storage_gb_hour, voice_second
    quantity: numeric("quantity", { precision: 12, scale: 6 }).notNull(),

    // Billing context (denormalized for query performance)
    billingPeriodStart: timestamp("billing_period_start", { withTimezone: true }).notNull(),
    billingPeriodEnd: timestamp("billing_period_end", { withTimezone: true }).notNull(),

    // Stripe sync status
    stripeMeterEventId: text("stripe_meter_event_id"),
    stripeSyncStatus: text("stripe_sync_status").notNull().default("pending"), // pending, synced, failed, not_required
    stripeSyncAttempts: integer("stripe_sync_attempts").notNull().default(0),
    stripeSyncError: text("stripe_sync_error"),
    stripeSyncedAt: timestamp("stripe_synced_at", { withTimezone: true }),

    // Timestamps
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),

    // Idempotency key prevents duplicates
    idempotencyKey: text("idempotency_key").notNull().unique(),
  },
  (table) => [
    index("usage_events_user_period_idx").on(
      table.userId,
      table.billingPeriodStart,
      table.billingPeriodEnd
    ),
    index("usage_events_workspace_idx").on(table.workspaceId, table.recordedAt),
    index("usage_events_type_period_idx").on(table.eventType, table.billingPeriodStart),
    index("usage_events_stripe_pending_idx").on(table.stripeSyncStatus),
  ]
);

// Processed webhooks (idempotency for Stripe webhooks)
export const processedWebhooks = pgTable(
  "processed_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeEventId: text("stripe_event_id").notNull().unique(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
    // Auto-cleanup old entries (30 days)
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("processed_webhooks_expires_idx").on(table.expiresAt)]
);

// Billing alerts (notifications for usage limits, payment issues)
export const billingAlerts = pgTable(
  "billing_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    alertType: text("alert_type").notNull(), // usage_50_percent, usage_80_percent, usage_100_percent, payment_failed, etc.
    resourceType: text("resource_type"), // compute, storage, voice (null for non-usage alerts)
    message: text("message").notNull(),
    metadata: text("metadata"), // JSON string for additional data

    // Billing period this alert is for (prevents duplicates per period)
    billingPeriodStart: timestamp("billing_period_start", { withTimezone: true }).notNull(),

    // Delivery status
    emailSent: boolean("email_sent").default(false),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    inAppDismissed: boolean("in_app_dismissed").default(false),
    inAppDismissedAt: timestamp("in_app_dismissed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("billing_alerts_user_idx").on(table.userId, table.createdAt),
    uniqueIndex("billing_alerts_unique_idx").on(
      table.userId,
      table.alertType,
      table.resourceType,
      table.billingPeriodStart
    ),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  workspaces: many(workspaces),
  anthropicCredential: one(anthropicCredentials),
  costEvents: many(costEvents),
  costSnapshots: many(costSnapshots),
  subscription: one(subscriptions),
  usageEvents: many(usageEvents),
  billingAlerts: many(billingAlerts),
}));

export const anthropicCredentialsRelations = relations(anthropicCredentials, ({ one }) => ({
  user: one(users, {
    fields: [anthropicCredentials.userId],
    references: [users.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  user: one(users, { fields: [workspaces.userId], references: [users.id] }),
  volume: one(workspaceVolumes),
  instance: one(workspaceInstances),
  sessions: many(sessions),
  costEvents: many(costEvents),
  costSnapshots: many(costSnapshots),
}));

export const workspaceVolumesRelations = relations(workspaceVolumes, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceVolumes.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspaceInstancesRelations = relations(workspaceInstances, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceInstances.workspaceId],
    references: [workspaces.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [sessions.workspaceId], references: [workspaces.id] }),
  previews: many(previews),
}));

export const previewsRelations = relations(previews, ({ one }) => ({
  session: one(sessions, { fields: [previews.sessionId], references: [sessions.id] }),
}));

export const costEventsRelations = relations(costEvents, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [costEvents.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [costEvents.userId],
    references: [users.id],
  }),
}));

export const costSnapshotsRelations = relations(costSnapshots, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [costSnapshots.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [costSnapshots.userId],
    references: [users.id],
  }),
}));

// Billing system relations
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(users, {
    fields: [usageEvents.userId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [usageEvents.workspaceId],
    references: [workspaces.id],
  }),
}));

export const billingAlertsRelations = relations(billingAlerts, ({ one }) => ({
  user: one(users, {
    fields: [billingAlerts.userId],
    references: [users.id],
  }),
}));
