import { Hono } from "hono";
import { cleanupOrphanedResources, findOrphanedResources } from "../services/orphan-cleanup.js";

/**
 * Admin routes for system maintenance operations.
 * These routes require admin authentication (checked via ADMIN_SECRET header).
 */
export const adminRoute = new Hono();

// Simple admin auth middleware
adminRoute.use("*", async (c, next) => {
  const adminSecret = process.env["ADMIN_SECRET"];
  const providedSecret = c.req.header("X-Admin-Secret");

  if (!adminSecret) {
    return c.json({ error: "Admin routes not configured" }, 503);
  }

  if (!providedSecret || providedSecret !== adminSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});

/**
 * GET /api/v1/admin/orphaned-resources
 * List orphaned Hetzner resources without deleting them
 */
adminRoute.get("/orphaned-resources", async (c) => {
  try {
    const { volumes, servers } = await findOrphanedResources();

    return c.json({
      orphanedVolumes: volumes.map((v) => ({
        hetznerId: v.hetznerId,
        name: v.name,
        reason: v.reason,
        createdAt: v.createdAt.toISOString(),
      })),
      orphanedServers: servers.map((s) => ({
        hetznerId: s.hetznerId,
        name: s.name,
        reason: s.reason,
        createdAt: s.createdAt.toISOString(),
      })),
      summary: {
        totalOrphanedVolumes: volumes.length,
        totalOrphanedServers: servers.length,
      },
    });
  } catch (error) {
    console.error("[admin] Error finding orphaned resources:", error);
    return c.json({ error: "Failed to find orphaned resources", details: String(error) }, 500);
  }
});

/**
 * POST /api/v1/admin/cleanup-orphans
 * Clean up orphaned Hetzner resources
 *
 * Query params:
 * - dryRun: "true" (default) or "false" - if true, only report what would be deleted
 */
adminRoute.post("/cleanup-orphans", async (c) => {
  const dryRun = c.req.query("dryRun") !== "false";

  try {
    const result = await cleanupOrphanedResources(dryRun);

    return c.json({
      success: true,
      dryRun: result.dryRun,
      orphanedResources: {
        volumes: result.orphanedVolumes.map((v) => ({
          hetznerId: v.hetznerId,
          name: v.name,
          reason: v.reason,
        })),
        servers: result.orphanedServers.map((s) => ({
          hetznerId: s.hetznerId,
          name: s.name,
          reason: s.reason,
        })),
      },
      deleted: {
        volumes: result.deletedVolumes,
        servers: result.deletedServers,
      },
      errors: result.errors,
    });
  } catch (error) {
    console.error("[admin] Error cleaning up orphans:", error);
    return c.json({ error: "Cleanup failed", details: String(error) }, 500);
  }
});
