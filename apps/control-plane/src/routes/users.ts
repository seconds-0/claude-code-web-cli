import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { users, workspaces } from "@ccc/db";
import { authMiddleware } from "../middleware/auth.js";
import type { UserResponse } from "@ccc/api-contract";

type Variables = {
  userId: string;
};

export const usersRoute = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all routes
usersRoute.use("*", authMiddleware);

// GET /api/v1/users/me - Get current user profile
usersRoute.get("/me", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  let user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  // Auto-create user on first access
  if (!user) {
    const result = await db
      .insert(users)
      .values({
        clerkId,
        email: "unknown@example.com", // Will be updated via Clerk webhook
      })
      .returning();
    user = result[0];
  }

  if (!user) {
    return c.json({ error: "user_not_found", message: "Could not find or create user" }, 500);
  }

  const response: UserResponse = {
    user: {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  };

  return c.json(response);
});

// GET /api/v1/users/me/onboarding - Check onboarding status
usersRoute.get("/me/onboarding", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!user) {
    return c.json({
      completed: false,
      steps: {
        accountCreated: false,
        workspaceCreated: false,
        firstSession: false,
      },
    });
  }

  // Check if user has any workspaces
  const userWorkspaces = await db.query.workspaces.findMany({
    where: eq(workspaces.userId, user.id),
    limit: 1,
  });

  const hasWorkspace = userWorkspaces.length > 0;

  // Check if any workspace has been started (has a ready status or running instance)
  const hasStartedWorkspace = userWorkspaces.some(
    (w) => w.status === "ready" || w.status === "provisioning"
  );

  return c.json({
    completed: hasWorkspace && hasStartedWorkspace,
    steps: {
      accountCreated: true,
      workspaceCreated: hasWorkspace,
      firstSession: hasStartedWorkspace,
    },
  });
});

// PATCH /api/v1/users/me - Update user profile
usersRoute.patch("/me", async (c) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!user) {
    return c.json({ error: "not_found", message: "User not found" }, 404);
  }

  const body = await c.req.json();
  const updates: Partial<{ email: string }> = {};

  if (body.email && typeof body.email === "string") {
    // Basic email validation
    if (!body.email.includes("@")) {
      return c.json({ error: "bad_request", message: "Invalid email format" }, 400);
    }
    updates.email = body.email;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: "bad_request", message: "No valid fields to update" }, 400);
  }

  const result = await db
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.clerkId, clerkId))
    .returning();

  const updated = result[0];
  if (!updated) {
    return c.json({ error: "update_failed", message: "Failed to update user" }, 500);
  }

  const response: UserResponse = {
    user: {
      id: updated.id,
      clerkId: updated.clerkId,
      email: updated.email,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  };

  return c.json(response);
});
