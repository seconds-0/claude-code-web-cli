import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { workspaces, workspaceVolumes, workspaceInstances, users } from "@ccc/db";
import { authMiddleware } from "../middleware/auth.js";
import type {
  CreateWorkspaceRequest,
  WorkspaceResponse,
  WorkspacesResponse,
} from "@ccc/api-contract";

type Variables = {
  userId: string;
  dbUserId: string;
};

export const workspacesRoute = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all routes
workspacesRoute.use("*", authMiddleware);

// Middleware to resolve Clerk userId to database userId
workspacesRoute.use("*", async (c, next) => {
  const clerkId = c.get("userId");
  const db = getDb();

  // Find or create user
  let user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!user) {
    // Auto-create user on first access
    const result = await db
      .insert(users)
      .values({
        clerkId,
        email: "unknown@example.com", // Will be updated from Clerk webhook
      })
      .returning();
    user = result[0];
  }

  if (!user) {
    return c.json({ error: "user_not_found", message: "Could not find or create user" }, 500);
  }

  c.set("dbUserId", user.id);
  return next();
});

// GET /api/v1/workspaces - List all workspaces for current user
workspacesRoute.get("/", async (c) => {
  const dbUserId = c.get("dbUserId");
  const db = getDb();

  const userWorkspaces = await db.query.workspaces.findMany({
    where: eq(workspaces.userId, dbUserId),
    orderBy: (workspaces, { desc }) => [desc(workspaces.createdAt)],
  });

  const response: WorkspacesResponse = {
    workspaces: userWorkspaces.map((w) => ({
      id: w.id,
      userId: w.userId,
      name: w.name,
      status: w.status as "pending" | "provisioning" | "ready" | "suspended" | "error",
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    })),
  };

  return c.json(response);
});

// POST /api/v1/workspaces - Create a new workspace
workspacesRoute.post("/", async (c) => {
  const dbUserId = c.get("dbUserId");
  const db = getDb();

  let body: CreateWorkspaceRequest = {};
  try {
    body = await c.req.json();
  } catch {
    // Empty body is fine, name is optional
  }

  const name = body.name || "default";

  // Create workspace
  const workspaceResult = await db
    .insert(workspaces)
    .values({
      userId: dbUserId,
      name,
      status: "pending",
    })
    .returning();

  const workspace = workspaceResult[0];
  if (!workspace) {
    return c.json({ error: "create_failed", message: "Failed to create workspace" }, 500);
  }

  // Create associated volume record
  const volumeResult = await db
    .insert(workspaceVolumes)
    .values({
      workspaceId: workspace.id,
      sizeGb: 50,
      status: "pending",
    })
    .returning();

  const volume = volumeResult[0];
  if (!volume) {
    return c.json({ error: "create_failed", message: "Failed to create volume" }, 500);
  }

  // Create associated instance record
  const instanceResult = await db
    .insert(workspaceInstances)
    .values({
      workspaceId: workspace.id,
      status: "pending",
    })
    .returning();

  const instance = instanceResult[0];
  if (!instance) {
    return c.json({ error: "create_failed", message: "Failed to create instance" }, 500);
  }

  const response: WorkspaceResponse = {
    workspace: {
      id: workspace.id,
      userId: workspace.userId,
      name: workspace.name,
      status: workspace.status as "pending" | "provisioning" | "ready" | "suspended" | "error",
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    },
    volume: {
      id: volume.id,
      workspaceId: volume.workspaceId,
      hetznerVolumeId: volume.hetznerVolumeId,
      sizeGb: volume.sizeGb,
      status: volume.status,
      createdAt: volume.createdAt.toISOString(),
    },
    instance: {
      id: instance.id,
      workspaceId: instance.workspaceId,
      hetznerServerId: instance.hetznerServerId,
      tailscaleIp: instance.tailscaleIp,
      status: instance.status as "pending" | "starting" | "running" | "stopping" | "stopped",
      startedAt: instance.startedAt?.toISOString() ?? null,
      stoppedAt: instance.stoppedAt?.toISOString() ?? null,
      createdAt: instance.createdAt.toISOString(),
    },
  };

  return c.json(response, 201);
});

// GET /api/v1/workspaces/:id - Get a specific workspace
workspacesRoute.get("/:id", async (c) => {
  const dbUserId = c.get("dbUserId");
  const workspaceId = c.req.param("id");
  const db = getDb();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    with: {
      volume: true,
      instance: true,
    },
  });

  if (!workspace) {
    return c.json({ error: "not_found", message: "Workspace not found" }, 404);
  }

  // Check ownership
  if (workspace.userId !== dbUserId) {
    return c.json({ error: "forbidden", message: "Not authorized to access this workspace" }, 403);
  }

  const response: WorkspaceResponse = {
    workspace: {
      id: workspace.id,
      userId: workspace.userId,
      name: workspace.name,
      status: workspace.status as "pending" | "provisioning" | "ready" | "suspended" | "error",
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
    },
    volume: workspace.volume
      ? {
          id: workspace.volume.id,
          workspaceId: workspace.volume.workspaceId,
          hetznerVolumeId: workspace.volume.hetznerVolumeId,
          sizeGb: workspace.volume.sizeGb,
          status: workspace.volume.status,
          createdAt: workspace.volume.createdAt.toISOString(),
        }
      : null,
    instance: workspace.instance
      ? {
          id: workspace.instance.id,
          workspaceId: workspace.instance.workspaceId,
          hetznerServerId: workspace.instance.hetznerServerId,
          tailscaleIp: workspace.instance.tailscaleIp,
          status: workspace.instance.status as
            | "pending"
            | "starting"
            | "running"
            | "stopping"
            | "stopped",
          startedAt: workspace.instance.startedAt?.toISOString() ?? null,
          stoppedAt: workspace.instance.stoppedAt?.toISOString() ?? null,
          createdAt: workspace.instance.createdAt.toISOString(),
        }
      : null,
  };

  return c.json(response);
});

// PATCH /api/v1/workspaces/:id - Update workspace
workspacesRoute.patch("/:id", async (c) => {
  const dbUserId = c.get("dbUserId");
  const workspaceId = c.req.param("id");
  const db = getDb();

  // Check ownership first
  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!existing) {
    return c.json({ error: "not_found", message: "Workspace not found" }, 404);
  }

  if (existing.userId !== dbUserId) {
    return c.json({ error: "forbidden", message: "Not authorized to update this workspace" }, 403);
  }

  const body = await c.req.json();
  const updates: Partial<{ name: string }> = {};

  if (body.name && typeof body.name === "string") {
    updates.name = body.name;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "bad_request", message: "No valid fields to update" }, 400);
  }

  const updateResult = await db
    .update(workspaces)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning();

  const updated = updateResult[0];
  if (!updated) {
    return c.json({ error: "update_failed", message: "Failed to update workspace" }, 500);
  }

  const response: WorkspaceResponse = {
    workspace: {
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      status: updated.status as "pending" | "provisioning" | "ready" | "suspended" | "error",
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  };

  return c.json(response);
});

// DELETE /api/v1/workspaces/:id - Delete workspace
workspacesRoute.delete("/:id", async (c) => {
  const dbUserId = c.get("dbUserId");
  const workspaceId = c.req.param("id");
  const db = getDb();

  // Check ownership first
  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  if (!existing) {
    return c.json({ error: "not_found", message: "Workspace not found" }, 404);
  }

  if (existing.userId !== dbUserId) {
    return c.json({ error: "forbidden", message: "Not authorized to delete this workspace" }, 403);
  }

  // Delete workspace (cascades to volumes, instances, sessions, previews)
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

  return c.json({ success: true });
});
