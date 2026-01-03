/**
 * Orphaned Resource Cleanup Service
 *
 * Identifies and cleans up orphaned Hetzner resources (volumes, servers) that
 * are no longer associated with any workspace in the database.
 *
 * SAFETY MEASURES:
 * 1. Only considers resources unattached for > 24 hours (configurable)
 * 2. Cross-references with database to verify no active workspace
 * 3. Supports dry-run mode for auditing
 * 4. Logs all actions for audit trail
 */

import { getDb, isDbConfigured } from "../db.js";

interface HetznerVolume {
  id: number;
  name: string;
  server: number | null;
  created: string;
  status: string;
}

interface HetznerServer {
  id: number;
  name: string;
  created: string;
  status: string;
}

interface OrphanedResource {
  type: "volume" | "server";
  hetznerId: number;
  name: string;
  reason: string;
  createdAt: Date;
}

interface CleanupResult {
  dryRun: boolean;
  orphanedVolumes: OrphanedResource[];
  orphanedServers: OrphanedResource[];
  deletedVolumes: number[];
  deletedServers: number[];
  errors: string[];
}

const HETZNER_API_BASE = "https://api.hetzner.cloud/v1";
const MIN_ORPHAN_AGE_HOURS = 24; // Don't delete anything less than 24 hours old

async function hetznerRequest<T>(
  endpoint: string,
  method: "GET" | "DELETE" = "GET"
): Promise<T | null> {
  const token = process.env["HETZNER_API_TOKEN"];
  if (!token) {
    console.error("[orphan-cleanup] HETZNER_API_TOKEN not configured");
    return null;
  }

  try {
    const res = await fetch(`${HETZNER_API_BASE}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error(`[orphan-cleanup] Hetzner API error: ${res.status} ${res.statusText}`);
      return null;
    }

    if (method === "DELETE") {
      return {} as T;
    }

    return (await res.json()) as T;
  } catch (error) {
    console.error("[orphan-cleanup] Hetzner API request failed:", error);
    return null;
  }
}

/**
 * Get all Hetzner volumes
 */
async function getHetznerVolumes(): Promise<HetznerVolume[]> {
  const result = await hetznerRequest<{ volumes: HetznerVolume[] }>("/volumes");
  return result?.volumes || [];
}

/**
 * Get all Hetzner servers
 */
async function getHetznerServers(): Promise<HetznerServer[]> {
  const result = await hetznerRequest<{ servers: HetznerServer[] }>("/servers");
  return result?.servers || [];
}

/**
 * Check if a resource is old enough to be considered orphaned
 */
function isOldEnough(createdAt: string, minAgeHours: number = MIN_ORPHAN_AGE_HOURS): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const ageHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
  return ageHours >= minAgeHours;
}

/**
 * Extract workspace ID from resource name (format: ccc-<workspaceId> or ccc-vol-ccc-<workspaceId>)
 */
function extractWorkspaceId(name: string): string | null {
  // Volume format: ccc-vol-ccc-<uuid-prefix>
  const volMatch = name.match(/ccc-vol-ccc-([a-f0-9-]+)/);
  if (volMatch?.[1]) {
    return volMatch[1];
  }

  // Server format: ccc-<uuid-prefix>
  const serverMatch = name.match(/^ccc-([a-f0-9-]+)$/);
  if (serverMatch?.[1]) {
    return serverMatch[1];
  }

  return null;
}

/**
 * Find orphaned resources
 */
export async function findOrphanedResources(): Promise<{
  volumes: OrphanedResource[];
  servers: OrphanedResource[];
}> {
  const orphanedVolumes: OrphanedResource[] = [];
  const orphanedServers: OrphanedResource[] = [];

  // Get all Hetzner resources
  const [hetznerVolumes, hetznerServers] = await Promise.all([
    getHetznerVolumes(),
    getHetznerServers(),
  ]);

  console.log(
    `[orphan-cleanup] Found ${hetznerVolumes.length} volumes, ${hetznerServers.length} servers in Hetzner`
  );

  // Get all workspace IDs from database
  let dbWorkspaceIds: Set<string> = new Set();
  let dbVolumeHetznerIds: Set<string> = new Set();
  let dbServerHetznerIds: Set<string> = new Set();

  if (isDbConfigured()) {
    const db = getDb();

    // Get all workspace IDs (including partial matches for UUID prefixes)
    const allWorkspaces = await db.query.workspaces.findMany({
      columns: { id: true },
    });
    dbWorkspaceIds = new Set(allWorkspaces.map((w) => w.id));

    // Get all volume Hetzner IDs
    const allVolumes = await db.query.workspaceVolumes.findMany({
      columns: { hetznerVolumeId: true },
    });
    dbVolumeHetznerIds = new Set(
      allVolumes.map((v) => v.hetznerVolumeId).filter((id): id is string => id !== null)
    );

    // Get all server Hetzner IDs
    const allInstances = await db.query.workspaceInstances.findMany({
      columns: { hetznerServerId: true },
    });
    dbServerHetznerIds = new Set(
      allInstances.map((i) => i.hetznerServerId).filter((id): id is string => id !== null)
    );

    console.log(
      `[orphan-cleanup] Database has ${dbWorkspaceIds.size} workspaces, ${dbVolumeHetznerIds.size} volumes, ${dbServerHetznerIds.size} instances`
    );
  }

  // Check volumes
  for (const volume of hetznerVolumes) {
    // Skip if attached to a server
    if (volume.server !== null) {
      continue;
    }

    // Skip if too new
    if (!isOldEnough(volume.created)) {
      console.log(`[orphan-cleanup] Volume ${volume.name} is too new (created ${volume.created})`);
      continue;
    }

    // Check if this volume is in the database
    const isInDb = dbVolumeHetznerIds.has(String(volume.id));
    if (isInDb) {
      console.log(`[orphan-cleanup] Volume ${volume.name} is in database, skipping`);
      continue;
    }

    // Extract workspace ID from name and check if workspace exists
    const workspaceId = extractWorkspaceId(volume.name);
    if (workspaceId) {
      const workspaceExists = Array.from(dbWorkspaceIds).some((id) => id.startsWith(workspaceId));
      if (workspaceExists) {
        console.log(`[orphan-cleanup] Volume ${volume.name} has matching workspace, skipping`);
        continue;
      }
    }

    orphanedVolumes.push({
      type: "volume",
      hetznerId: volume.id,
      name: volume.name,
      reason: "Unattached volume with no matching workspace in database",
      createdAt: new Date(volume.created),
    });
  }

  // Check servers
  for (const server of hetznerServers) {
    // Skip if too new
    if (!isOldEnough(server.created)) {
      console.log(`[orphan-cleanup] Server ${server.name} is too new (created ${server.created})`);
      continue;
    }

    // Check if this server is in the database
    const isInDb = dbServerHetznerIds.has(String(server.id));
    if (isInDb) {
      continue;
    }

    // Extract workspace ID from name and check if workspace exists
    const workspaceId = extractWorkspaceId(server.name);
    if (workspaceId) {
      const workspaceExists = Array.from(dbWorkspaceIds).some((id) => id.startsWith(workspaceId));
      if (workspaceExists) {
        console.log(`[orphan-cleanup] Server ${server.name} has matching workspace, skipping`);
        continue;
      }
    }

    orphanedServers.push({
      type: "server",
      hetznerId: server.id,
      name: server.name,
      reason: "Server with no matching workspace in database",
      createdAt: new Date(server.created),
    });
  }

  return { volumes: orphanedVolumes, servers: orphanedServers };
}

/**
 * Clean up orphaned resources
 */
export async function cleanupOrphanedResources(dryRun: boolean = true): Promise<CleanupResult> {
  console.log(
    `[orphan-cleanup] Starting cleanup (dryRun: ${dryRun}, minAge: ${MIN_ORPHAN_AGE_HOURS}h)`
  );

  const result: CleanupResult = {
    dryRun,
    orphanedVolumes: [],
    orphanedServers: [],
    deletedVolumes: [],
    deletedServers: [],
    errors: [],
  };

  try {
    const { volumes, servers } = await findOrphanedResources();
    result.orphanedVolumes = volumes;
    result.orphanedServers = servers;

    console.log(
      `[orphan-cleanup] Found ${volumes.length} orphaned volumes, ${servers.length} orphaned servers`
    );

    if (dryRun) {
      console.log("[orphan-cleanup] DRY RUN - not deleting anything");
      for (const vol of volumes) {
        console.log(`[orphan-cleanup] Would delete volume: ${vol.name} (ID: ${vol.hetznerId})`);
      }
      for (const srv of servers) {
        console.log(`[orphan-cleanup] Would delete server: ${srv.name} (ID: ${srv.hetznerId})`);
      }
      return result;
    }

    // Delete orphaned volumes
    for (const volume of volumes) {
      console.log(`[orphan-cleanup] Deleting volume: ${volume.name} (ID: ${volume.hetznerId})`);
      const deleteResult = await hetznerRequest(`/volumes/${volume.hetznerId}`, "DELETE");
      if (deleteResult !== null) {
        result.deletedVolumes.push(volume.hetznerId);
        console.log(`[orphan-cleanup] ✓ Deleted volume ${volume.name}`);
      } else {
        result.errors.push(`Failed to delete volume ${volume.name}`);
      }
    }

    // Delete orphaned servers
    for (const server of servers) {
      console.log(`[orphan-cleanup] Deleting server: ${server.name} (ID: ${server.hetznerId})`);
      const deleteResult = await hetznerRequest(`/servers/${server.hetznerId}`, "DELETE");
      if (deleteResult !== null) {
        result.deletedServers.push(server.hetznerId);
        console.log(`[orphan-cleanup] ✓ Deleted server ${server.name}`);
      } else {
        result.errors.push(`Failed to delete server ${server.name}`);
      }
    }
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(
    `[orphan-cleanup] Cleanup complete: ${result.deletedVolumes.length} volumes, ${result.deletedServers.length} servers deleted`
  );

  return result;
}
