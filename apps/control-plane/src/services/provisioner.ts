/**
 * Provisioner Service
 *
 * High-level service for managing workspace provisioning.
 * Wraps the job queue and provides a simple interface for API routes.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { workspaces, workspaceInstances } from "@ccc/db";
import {
  enqueueProvisionJob,
  enqueueDestroyJob,
  isQueueConfigured,
  type ProvisionJob,
  type DestroyJob,
} from "../jobs/queue.js";

export interface ProvisionResult {
  success: boolean;
  job?: ProvisionJob;
  error?: string;
}

export interface DestroyResult {
  success: boolean;
  job?: DestroyJob;
  error?: string;
}

/**
 * Start provisioning a workspace
 *
 * Validates the workspace state and enqueues a provision job.
 */
export async function startWorkspace(
  workspaceId: string,
  userId: string
): Promise<ProvisionResult> {
  const db = getDb();

  // Load workspace with instance
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    with: {
      instance: true,
    },
  });

  // Validate workspace exists and belongs to user
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  if (workspace.userId !== userId) {
    return { success: false, error: "Not authorized to start this workspace" };
  }

  // Check current status
  if (workspace.status === "provisioning") {
    return { success: false, error: "Workspace is already provisioning" };
  }

  if (workspace.instance?.status === "running") {
    return { success: false, error: "Workspace is already running" };
  }

  // Check if queue is configured
  if (!isQueueConfigured()) {
    // Fall back to direct status update (for development without Redis)
    console.warn("[provisioner] Queue not configured, updating status directly");

    await db
      .update(workspaces)
      .set({ status: "provisioning", updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    if (workspace.instance) {
      await db
        .update(workspaceInstances)
        .set({ status: "starting", startedAt: new Date() })
        .where(eq(workspaceInstances.workspaceId, workspaceId));
    }

    return {
      success: true,
      error: "Queue not configured - status updated but no actual provisioning will occur",
    };
  }

  // Update workspace status to provisioning
  await db
    .update(workspaces)
    .set({ status: "provisioning", updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));

  if (workspace.instance) {
    await db
      .update(workspaceInstances)
      .set({ status: "starting", startedAt: new Date() })
      .where(eq(workspaceInstances.workspaceId, workspaceId));
  }

  // Enqueue the provision job
  const job = await enqueueProvisionJob({
    workspaceId,
    userId,
  });

  return { success: true, job };
}

/**
 * Stop a running workspace
 *
 * Validates the workspace state and enqueues a destroy job.
 */
export async function stopWorkspace(workspaceId: string, userId: string): Promise<DestroyResult> {
  const db = getDb();

  // Load workspace with instance and volume
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    with: {
      instance: true,
      volume: true,
    },
  });

  // Validate workspace exists and belongs to user
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  if (workspace.userId !== userId) {
    return { success: false, error: "Not authorized to stop this workspace" };
  }

  // Check current status
  if (!workspace.instance || workspace.instance.status === "stopped") {
    return { success: false, error: "Workspace is already stopped" };
  }

  // Check if queue is configured
  if (!isQueueConfigured()) {
    // Fall back to direct status update (for development without Redis)
    console.warn("[provisioner] Queue not configured, updating status directly");

    await db
      .update(workspaceInstances)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(workspaceInstances.workspaceId, workspaceId));

    await db
      .update(workspaces)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    return {
      success: true,
      error: "Queue not configured - status updated but no actual cleanup occurred",
    };
  }

  // Update instance status to stopping
  await db
    .update(workspaceInstances)
    .set({ status: "stopping" })
    .where(eq(workspaceInstances.workspaceId, workspaceId));

  // Enqueue the destroy job
  const job = await enqueueDestroyJob({
    workspaceId,
    userId,
    hetznerServerId: workspace.instance.hetznerServerId || undefined,
    hetznerVolumeId: workspace.volume?.hetznerVolumeId || undefined,
  });

  return { success: true, job };
}

/**
 * Delete a workspace completely
 *
 * If the workspace has running cloud resources, enqueues a destroy job
 * and marks the workspace as "deleting". The destroy handler will perform
 * final cleanup. If no cloud resources exist, deletes immediately.
 */
export async function deleteWorkspace(
  workspaceId: string,
  userId: string
): Promise<{ success: boolean; error?: string; pending?: boolean }> {
  const db = getDb();

  // Load workspace with instance and volume
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    with: {
      instance: true,
      volume: true,
    },
  });

  // Validate workspace exists and belongs to user
  if (!workspace) {
    return { success: false, error: "Workspace not found" };
  }

  if (workspace.userId !== userId) {
    return { success: false, error: "Not authorized to delete this workspace" };
  }

  // Check if workspace has cloud resources that need cleanup
  const hasCloudResources =
    workspace.instance?.hetznerServerId ||
    workspace.volume?.hetznerVolumeId ||
    workspace.instance?.status === "running" ||
    workspace.status === "provisioning";

  if (hasCloudResources && isQueueConfigured()) {
    // Mark as deleting and enqueue cleanup job
    // Don't delete from DB until cloud resources are cleaned up
    await db
      .update(workspaces)
      .set({ status: "deleting" as "error", updatedAt: new Date() }) // Using "error" status until schema is updated
      .where(eq(workspaces.id, workspaceId));

    await enqueueDestroyJob({
      workspaceId,
      userId,
      hetznerServerId: workspace.instance?.hetznerServerId || undefined,
      hetznerVolumeId: workspace.volume?.hetznerVolumeId || undefined,
      deleteAfterDestroy: true, // Signal handler to delete DB record
    });

    return { success: true, pending: true };
  }

  // No cloud resources - safe to delete from database immediately
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

  return { success: true };
}

/**
 * Get workspace status with cloud resource info
 */
export async function getWorkspaceStatus(workspaceId: string): Promise<{
  workspace: {
    id: string;
    status: string;
  };
  instance: {
    status: string;
    hetznerServerId: string | null;
    tailscaleIp: string | null;
  } | null;
  volume: {
    status: string;
    hetznerVolumeId: string | null;
    sizeGb: number;
  } | null;
  queueConfigured: boolean;
} | null> {
  const db = getDb();

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    with: {
      instance: true,
      volume: true,
    },
  });

  if (!workspace) {
    return null;
  }

  return {
    workspace: {
      id: workspace.id,
      status: workspace.status,
    },
    instance: workspace.instance
      ? {
          status: workspace.instance.status,
          hetznerServerId: workspace.instance.hetznerServerId,
          tailscaleIp: workspace.instance.tailscaleIp,
        }
      : null,
    volume: workspace.volume
      ? {
          status: workspace.volume.status,
          hetznerVolumeId: workspace.volume.hetznerVolumeId,
          sizeGb: workspace.volume.sizeGb,
        }
      : null,
    queueConfigured: isQueueConfigured(),
  };
}
