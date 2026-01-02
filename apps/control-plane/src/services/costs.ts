/**
 * Cost Tracking Service
 *
 * Tracks Hetzner resource costs using event sourcing.
 * Records start/stop events and calculates costs based on hourly rates.
 *
 * Hetzner Pricing Reference (EUR/hour):
 * - cpx11: €0.0053/hr (~€3.85/mo)
 * - cpx21: €0.0097/hr (~€7.05/mo)
 * - cpx31: €0.0179/hr (~€12.99/mo)
 * - cpx41: €0.0329/hr (~€23.99/mo)
 * - cpx51: €0.0616/hr (~€44.99/mo)
 * - Volumes: €0.000055/hr per GB (~€0.04/GB/mo)
 */

import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { costEvents, costSnapshots, workspaceInstances, workspaceVolumes } from "@ccc/db/schema";
import type { Database } from "@ccc/db";

// Hetzner hourly rates in EUR
export const SERVER_HOURLY_RATES: Record<string, number> = {
  cpx11: 0.0053,
  cpx21: 0.0097,
  cpx31: 0.0179,
  cpx41: 0.0329,
  cpx51: 0.0616,
};

export const VOLUME_HOURLY_RATE_PER_GB = 0.000055;

// Default server type and rate
export const DEFAULT_SERVER_TYPE = "cpx11";
export const DEFAULT_SERVER_RATE = 0.0053;

// Event types
export type CostEventType = "start" | "stop" | "create" | "delete";
export type ResourceType = "server" | "volume";

export interface CostEvent {
  workspaceId?: string;
  userId?: string;
  resourceType: ResourceType;
  resourceId: string;
  serverType?: string;
  sizeGb?: number;
  eventType: CostEventType;
  hourlyRate: number;
  timestamp?: Date;
}

export interface CostSummary {
  currentHourlyBurn: number;
  runningServers: number;
  runningVolumes: number;
  todayCost: number;
  monthCost: number;
}

export interface WorkspaceCosts {
  workspaceId: string;
  totalCost: number;
  serverCost: number;
  volumeCost: number;
  runningHours: number;
}

export interface DailyCost {
  date: string;
  serverCost: number;
  volumeCost: number;
  totalCost: number;
}

/**
 * Cost Tracking Service
 */
export class CostService {
  constructor(private db: Database) {}

  /**
   * Record a cost event
   */
  async recordEvent(event: CostEvent): Promise<void> {
    await this.db.insert(costEvents).values({
      workspaceId: event.workspaceId,
      userId: event.userId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      serverType: event.serverType,
      sizeGb: event.sizeGb,
      eventType: event.eventType,
      hourlyRate: event.hourlyRate.toString(),
      timestamp: event.timestamp || new Date(),
    });
  }

  /**
   * Record server start event
   */
  async recordServerStart(params: {
    workspaceId: string;
    userId: string;
    serverId: string;
    serverType: string;
  }): Promise<void> {
    const hourlyRate = SERVER_HOURLY_RATES[params.serverType] ?? DEFAULT_SERVER_RATE;
    await this.recordEvent({
      workspaceId: params.workspaceId,
      userId: params.userId,
      resourceType: "server",
      resourceId: params.serverId,
      serverType: params.serverType,
      eventType: "start",
      hourlyRate,
    });
  }

  /**
   * Record server stop event
   */
  async recordServerStop(params: {
    workspaceId?: string;
    userId?: string;
    serverId: string;
    serverType: string;
  }): Promise<void> {
    const hourlyRate = SERVER_HOURLY_RATES[params.serverType] ?? DEFAULT_SERVER_RATE;
    await this.recordEvent({
      workspaceId: params.workspaceId,
      userId: params.userId,
      resourceType: "server",
      resourceId: params.serverId,
      serverType: params.serverType,
      eventType: "stop",
      hourlyRate,
    });
  }

  /**
   * Record volume create event
   */
  async recordVolumeCreate(params: {
    workspaceId: string;
    userId: string;
    volumeId: string;
    sizeGb: number;
  }): Promise<void> {
    const hourlyRate = params.sizeGb * VOLUME_HOURLY_RATE_PER_GB;
    await this.recordEvent({
      workspaceId: params.workspaceId,
      userId: params.userId,
      resourceType: "volume",
      resourceId: params.volumeId,
      sizeGb: params.sizeGb,
      eventType: "create",
      hourlyRate,
    });
  }

  /**
   * Record volume delete event
   */
  async recordVolumeDelete(params: {
    workspaceId?: string;
    userId?: string;
    volumeId: string;
    sizeGb: number;
  }): Promise<void> {
    const hourlyRate = params.sizeGb * VOLUME_HOURLY_RATE_PER_GB;
    await this.recordEvent({
      workspaceId: params.workspaceId,
      userId: params.userId,
      resourceType: "volume",
      resourceId: params.volumeId,
      sizeGb: params.sizeGb,
      eventType: "delete",
      hourlyRate,
    });
  }

  /**
   * Calculate current running costs based on active resources
   */
  async getCurrentCosts(): Promise<CostSummary> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get active resources from workspace instances and volumes
    // Only include volumes that are available/attached (not pending or deleted)
    const [instances, volumes] = await Promise.all([
      this.db.select().from(workspaceInstances).where(eq(workspaceInstances.status, "running")),
      this.db.select().from(workspaceVolumes).where(eq(workspaceVolumes.status, "available")),
    ]);

    // Calculate current hourly burn using actual server types
    let serverHourlyBurn = 0;
    for (const instance of instances) {
      const rate = SERVER_HOURLY_RATES[instance.serverType || "cpx11"] ?? DEFAULT_SERVER_RATE;
      serverHourlyBurn += rate;
    }

    let volumeHourlyBurn = 0;
    for (const volume of volumes) {
      volumeHourlyBurn += (volume.sizeGb || 50) * VOLUME_HOURLY_RATE_PER_GB;
    }

    // Get today's and month's costs from snapshots
    const [todaySnapshot, monthSnapshots] = await Promise.all([
      this.db
        .select({
          total: sql<string>`COALESCE(SUM(${costSnapshots.totalCost}), '0')`,
        })
        .from(costSnapshots)
        .where(gte(costSnapshots.date, todayStart.toISOString().split("T")[0]!)),
      this.db
        .select({
          total: sql<string>`COALESCE(SUM(${costSnapshots.totalCost}), '0')`,
        })
        .from(costSnapshots)
        .where(gte(costSnapshots.date, monthStart.toISOString().split("T")[0]!)),
    ]);

    return {
      currentHourlyBurn: serverHourlyBurn + volumeHourlyBurn,
      runningServers: instances.length,
      runningVolumes: volumes.length,
      todayCost: parseFloat(todaySnapshot[0]?.total || "0"),
      monthCost: parseFloat(monthSnapshots[0]?.total || "0"),
    };
  }

  /**
   * Calculate costs for a specific workspace
   */
  async getWorkspaceCosts(workspaceId: string): Promise<WorkspaceCosts> {
    // Get all events for this workspace
    const events = await this.db
      .select()
      .from(costEvents)
      .where(eq(costEvents.workspaceId, workspaceId))
      .orderBy(costEvents.timestamp);

    // Calculate costs by tracking resource run time
    let serverCost = 0;
    let volumeCost = 0;
    let runningHours = 0;

    const resourceStarts = new Map<string, { timestamp: Date; hourlyRate: number }>();

    for (const event of events) {
      const key = `${event.resourceType}:${event.resourceId}`;
      const hourlyRate = parseFloat(event.hourlyRate);

      if (event.eventType === "start" || event.eventType === "create") {
        resourceStarts.set(key, { timestamp: event.timestamp, hourlyRate });
      } else if (event.eventType === "stop" || event.eventType === "delete") {
        const start = resourceStarts.get(key);
        if (start) {
          const hours = (event.timestamp.getTime() - start.timestamp.getTime()) / (1000 * 60 * 60);
          const cost = hours * start.hourlyRate;

          if (event.resourceType === "server") {
            serverCost += cost;
            runningHours += hours;
          } else {
            volumeCost += cost;
          }

          resourceStarts.delete(key);
        }
      }
    }

    // Add ongoing costs for resources still running
    const now = new Date();
    for (const [key, start] of resourceStarts) {
      const hours = (now.getTime() - start.timestamp.getTime()) / (1000 * 60 * 60);
      const cost = hours * start.hourlyRate;
      const [resourceType] = key.split(":");

      if (resourceType === "server") {
        serverCost += cost;
        runningHours += hours;
      } else {
        volumeCost += cost;
      }
    }

    return {
      workspaceId,
      totalCost: serverCost + volumeCost,
      serverCost,
      volumeCost,
      runningHours,
    };
  }

  /**
   * Get historical costs by date range
   */
  async getHistoricalCosts(startDate: Date, endDate: Date): Promise<DailyCost[]> {
    const snapshots = await this.db
      .select()
      .from(costSnapshots)
      .where(
        and(
          gte(costSnapshots.date, startDate.toISOString().split("T")[0]!),
          lte(costSnapshots.date, endDate.toISOString().split("T")[0]!)
        )
      )
      .orderBy(costSnapshots.date);

    // Aggregate by date (sum across all workspaces)
    const byDate = new Map<string, DailyCost>();

    for (const snapshot of snapshots) {
      const existing = byDate.get(snapshot.date);
      if (existing) {
        existing.serverCost += parseFloat(snapshot.serverCost || "0");
        existing.volumeCost += parseFloat(snapshot.volumeCost || "0");
        existing.totalCost += parseFloat(snapshot.totalCost || "0");
      } else {
        byDate.set(snapshot.date, {
          date: snapshot.date,
          serverCost: parseFloat(snapshot.serverCost || "0"),
          volumeCost: parseFloat(snapshot.volumeCost || "0"),
          totalCost: parseFloat(snapshot.totalCost || "0"),
        });
      }
    }

    return Array.from(byDate.values());
  }

  /**
   * Snapshot daily costs (run via cron/scheduled job)
   * Calculates costs from events and creates daily aggregates
   *
   * This method handles three cases:
   * 1. Resources that started AND stopped within the day
   * 2. Resources that started before the day and stopped during the day
   * 3. Resources that were running for the entire day (started before, still running or stopped after)
   */
  async snapshotDailyCosts(date?: Date): Promise<void> {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split("T")[0]!;
    const dayStart = new Date(dateStr);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // Step 1: Get ALL events before dayEnd to understand resource state
    // We need events before dayStart to know what was running at day start
    const allEvents = await this.db
      .select()
      .from(costEvents)
      .where(lte(costEvents.timestamp, dayEnd))
      .orderBy(costEvents.timestamp);

    // Build a map of resource state at dayStart and track what happens during the day
    // Key: resourceType:resourceId -> latest start event info (or null if stopped)
    const resourceState = new Map<
      string,
      {
        startTimestamp: Date;
        hourlyRate: number;
        workspaceId: string | null;
        userId: string | null;
        resourceType: string;
        sizeGb: number | null;
      } | null
    >();

    // Track costs by workspace
    const workspaceCosts = new Map<
      string | null,
      {
        serverHours: number;
        serverCost: number;
        volumeGbHours: number;
        volumeCost: number;
        userId: string | null;
      }
    >();

    // Helper to add cost to a workspace
    const addCost = (
      workspaceId: string | null,
      userId: string | null,
      resourceType: string,
      hours: number,
      cost: number,
      sizeGb: number | null
    ) => {
      const existing = workspaceCosts.get(workspaceId) || {
        serverHours: 0,
        serverCost: 0,
        volumeGbHours: 0,
        volumeCost: 0,
        userId,
      };

      if (resourceType === "server") {
        existing.serverHours += hours;
        existing.serverCost += cost;
      } else {
        existing.volumeGbHours += hours * (sizeGb || 0);
        existing.volumeCost += cost;
      }

      workspaceCosts.set(workspaceId, existing);
    };

    // Process all events
    for (const event of allEvents) {
      const key = `${event.resourceType}:${event.resourceId}`;
      const eventTime = event.timestamp;
      const hourlyRate = parseFloat(event.hourlyRate);

      if (event.eventType === "start" || event.eventType === "create") {
        // If this start is before dayStart, just track the state
        // If it's during the day, it becomes the new start time for cost calculation
        resourceState.set(key, {
          startTimestamp: eventTime,
          hourlyRate,
          workspaceId: event.workspaceId,
          userId: event.userId,
          resourceType: event.resourceType,
          sizeGb: event.sizeGb,
        });
      } else if (event.eventType === "stop" || event.eventType === "delete") {
        const state = resourceState.get(key);

        if (state) {
          // Calculate cost for this resource during the target day
          // The billable period is: max(state.startTimestamp, dayStart) to min(eventTime, dayEnd)
          const periodStart = new Date(
            Math.max(state.startTimestamp.getTime(), dayStart.getTime())
          );
          const periodEnd = new Date(Math.min(eventTime.getTime(), dayEnd.getTime()));

          if (periodStart < periodEnd) {
            const hours = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
            const cost = hours * state.hourlyRate;
            addCost(state.workspaceId, state.userId, state.resourceType, hours, cost, state.sizeGb);
          }
        }

        // Resource is now stopped
        resourceState.set(key, null);
      }
    }

    // Handle resources still running at end of day
    for (const [, state] of resourceState) {
      if (state) {
        // Resource is still running - calculate cost from max(startTime, dayStart) to dayEnd
        const periodStart = new Date(Math.max(state.startTimestamp.getTime(), dayStart.getTime()));

        if (periodStart < dayEnd) {
          const hours = (dayEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
          const cost = hours * state.hourlyRate;
          addCost(state.workspaceId, state.userId, state.resourceType, hours, cost, state.sizeGb);
        }
      }
    }

    // Insert snapshots
    for (const [workspaceId, costs] of workspaceCosts) {
      await this.db
        .insert(costSnapshots)
        .values({
          date: dateStr,
          workspaceId: workspaceId || undefined,
          userId: costs.userId || undefined,
          serverHours: costs.serverHours.toFixed(4),
          serverCost: costs.serverCost.toFixed(4),
          volumeGbHours: costs.volumeGbHours.toFixed(4),
          volumeCost: costs.volumeCost.toFixed(4),
          totalCost: (costs.serverCost + costs.volumeCost).toFixed(4),
        })
        .onConflictDoUpdate({
          target: [costSnapshots.date, costSnapshots.workspaceId],
          set: {
            serverHours: costs.serverHours.toFixed(4),
            serverCost: costs.serverCost.toFixed(4),
            volumeGbHours: costs.volumeGbHours.toFixed(4),
            volumeCost: costs.volumeCost.toFixed(4),
            totalCost: (costs.serverCost + costs.volumeCost).toFixed(4),
          },
        });
    }
  }

  /**
   * Get recent cost events (for debugging/admin)
   */
  async getRecentEvents(limit = 50): Promise<(typeof costEvents.$inferSelect)[]> {
    return this.db.select().from(costEvents).orderBy(desc(costEvents.timestamp)).limit(limit);
  }
}

/**
 * Create a CostService instance
 */
export function createCostService(db: Database): CostService {
  return new CostService(db);
}
