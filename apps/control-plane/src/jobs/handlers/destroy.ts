/**
 * Destroy Job Handler
 *
 * Handles the destruction of workspace resources:
 * 1. Update status to stopping
 * 2. Detach volume from server (keep volume for persistence)
 * 3. Delete Hetzner server
 * 4. Delete Tailscale device
 * 5. Update database
 *
 * TRADE-OFF: Each cleanup step continues even if previous steps fail.
 * This is intentional to ensure maximum cleanup. Errors are logged but
 * don't prevent subsequent cleanup attempts. This "best-effort" approach
 * is preferred over strict atomicity because:
 * 1. Partial cleanup is better than no cleanup (avoids orphaned resources)
 * 2. Cloud resources have their own consistency guarantees
 * 3. The job queue retries handle transient failures
 * 4. Worst case: minor orphaned resources that can be cleaned up later
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db.js";
import { workspaces, workspaceInstances } from "@ccc/db";
import { createHetznerService } from "../../services/hetzner.js";
import { createTailscaleService } from "../../services/tailscale.js";
import { createCostService } from "../../services/costs.js";
import type { DestroyJob } from "../queue.js";

/**
 * Main destroy handler
 */
export async function handleDestroyJob(job: DestroyJob): Promise<void> {
  const { workspaceId, userId, hetznerServerId, tailscaleDeviceId } = job;
  const db = getDb();

  console.log(`[destroy] Starting job ${job.id} for workspace ${workspaceId}`);

  // Load workspace
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    with: {
      volume: true,
      instance: true,
    },
  });

  if (!workspace) {
    console.warn(`[destroy] Workspace ${workspaceId} not found, skipping`);
    return;
  }

  if (workspace.userId !== userId) {
    throw new Error(`Workspace ${workspaceId} does not belong to user ${userId}`);
  }

  // Get server ID from job or database
  const serverId = hetznerServerId || workspace.instance?.hetznerServerId;

  // Initialize services
  const hetzner = createHetznerService();
  const tailscale = createTailscaleService();
  const costs = createCostService(db);

  try {
    // Step 1: Update status to stopping
    console.log(`[destroy] Updating workspace status to stopping`);
    await db
      .update(workspaceInstances)
      .set({ status: "stopping" })
      .where(eq(workspaceInstances.workspaceId, workspaceId));

    // Step 2: Detach volume from server (if attached)
    if (workspace.volume?.hetznerVolumeId && serverId) {
      try {
        console.log(`[destroy] Detaching volume ${workspace.volume.hetznerVolumeId}`);
        const volumeId = parseInt(workspace.volume.hetznerVolumeId, 10);
        const volume = await hetzner.getVolume(volumeId);

        if (volume && volume.server) {
          const detachAction = await hetzner.detachVolume(volumeId);
          await hetzner.waitForAction(detachAction.id);
          console.log(`[destroy] Volume detached`);
        }
      } catch (error) {
        console.warn(`[destroy] Failed to detach volume:`, error);
        // Continue with destruction even if detach fails
      }
    }

    // Step 3: Delete Hetzner server
    if (serverId) {
      try {
        console.log(`[destroy] Deleting Hetzner server ${serverId}`);
        const serverIdNum = parseInt(serverId, 10);
        const server = await hetzner.getServer(serverIdNum);

        if (server) {
          const deleteAction = await hetzner.deleteServer(serverIdNum);
          await hetzner.waitForAction(deleteAction.id);
          console.log(`[destroy] Server deleted`);

          // Record server stop cost event - use serverType from DB, fallback to env
          const serverType =
            workspace.instance?.serverType || process.env["HETZNER_SERVER_TYPE"] || "cpx11";
          await costs.recordServerStop({
            workspaceId,
            userId,
            serverId: String(serverIdNum),
            serverType,
          });
          console.log(`[destroy] Recorded server stop cost event (type: ${serverType})`);
        } else {
          console.log(`[destroy] Server ${serverId} not found, skipping`);
        }
      } catch (error) {
        console.warn(`[destroy] Failed to delete server:`, error);
        // Continue even if server deletion fails
      }
    }

    // Step 4: Delete Tailscale device
    const deviceId = tailscaleDeviceId || (await findTailscaleDevice(tailscale, workspaceId));
    if (deviceId) {
      try {
        console.log(`[destroy] Deleting Tailscale device ${deviceId}`);
        await tailscale.deleteDevice(deviceId);
        console.log(`[destroy] Tailscale device deleted`);
      } catch (error) {
        console.warn(`[destroy] Failed to delete Tailscale device:`, error);
        // Continue even if device deletion fails
      }
    }

    // Step 5: Delete volume if full deletion is requested
    if (job.deleteAfterDestroy && workspace.volume?.hetznerVolumeId) {
      try {
        const volumeId = parseInt(workspace.volume.hetznerVolumeId, 10);
        console.log(`[destroy] Deleting Hetzner volume ${volumeId}`);
        const volume = await hetzner.getVolume(volumeId);

        if (volume) {
          await hetzner.deleteVolume(volumeId);
          console.log(`[destroy] Volume deleted`);

          // Record volume delete cost event
          await costs.recordVolumeDelete({
            workspaceId,
            userId,
            volumeId: String(volumeId),
            sizeGb: workspace.volume.sizeGb || 50,
          });
          console.log(`[destroy] Recorded volume delete cost event`);
        } else {
          console.log(`[destroy] Volume ${volumeId} not found, skipping`);
        }
      } catch (error) {
        console.warn(`[destroy] Failed to delete volume:`, error);
        // Continue even if volume deletion fails
      }
    }

    // Step 6: Update database or delete if requested
    if (job.deleteAfterDestroy) {
      // Full deletion requested - remove from database
      console.log(`[destroy] Deleting workspace ${workspaceId} from database`);
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      console.log(`[destroy] Workspace ${workspaceId} deleted completely`);
    } else {
      // Normal stop - just update status
      await db
        .update(workspaceInstances)
        .set({
          status: "stopped",
          stoppedAt: new Date(),
          hetznerServerId: null,
          tailscaleIp: null,
        })
        .where(eq(workspaceInstances.workspaceId, workspaceId));

      await db
        .update(workspaces)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId));

      console.log(`[destroy] Workspace ${workspaceId} suspended successfully`);
    }
  } catch (error) {
    console.error(`[destroy] Error destroying workspace ${workspaceId}:`, error);

    // Update status to error
    await db
      .update(workspaces)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    throw error;
  }
}

/**
 * Find the Tailscale device for a workspace by hostname
 */
async function findTailscaleDevice(
  tailscale: ReturnType<typeof createTailscaleService>,
  workspaceId: string
): Promise<string | null> {
  const shortId = workspaceId.replace(/-/g, "").slice(0, 8);
  const hostname = `ccc-${shortId}`;

  try {
    const device = await tailscale.getDeviceByHostname(hostname);
    return device?.id || null;
  } catch {
    return null;
  }
}
