import { pgTable, uuid, text, timestamp, integer, uniqueIndex, boolean } from "drizzle-orm/pg-core";
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  user: one(users, { fields: [workspaces.userId], references: [users.id] }),
  volume: one(workspaceVolumes),
  instance: one(workspaceInstances),
  sessions: many(sessions),
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
