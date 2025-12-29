import { z } from "zod";
import { uuidSchema, timestampSchema } from "./common.js";

export const workspaceStatusSchema = z.enum([
  "pending",
  "provisioning",
  "ready",
  "suspended",
  "error",
]);

export const instanceStatusSchema = z.enum([
  "pending",
  "starting",
  "running",
  "stopping",
  "stopped",
]);

export const workspaceSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string(),
  status: workspaceStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const workspaceVolumeSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  hetznerVolumeId: z.string().nullable(),
  sizeGb: z.number().int().positive(),
  status: z.string(),
  createdAt: timestampSchema,
});

export const workspaceInstanceSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  hetznerServerId: z.string().nullable(),
  tailscaleIp: z.string().nullable(),
  status: instanceStatusSchema,
  startedAt: timestampSchema.nullable(),
  stoppedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});

// Request schemas
export const createWorkspaceRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// Response schemas
export const workspaceResponseSchema = z.object({
  workspace: workspaceSchema,
  instance: workspaceInstanceSchema.nullable().optional(),
  volume: workspaceVolumeSchema.nullable().optional(),
});

export const workspacesResponseSchema = z.object({
  workspaces: z.array(workspaceSchema),
});

export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;
export type InstanceStatus = z.infer<typeof instanceStatusSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceVolume = z.infer<typeof workspaceVolumeSchema>;
export type WorkspaceInstance = z.infer<typeof workspaceInstanceSchema>;
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
export type WorkspacesResponse = z.infer<typeof workspacesResponseSchema>;
