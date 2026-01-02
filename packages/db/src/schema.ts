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

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  workspaces: many(workspaces),
  anthropicCredential: one(anthropicCredentials),
  costEvents: many(costEvents),
  costSnapshots: many(costSnapshots),
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
