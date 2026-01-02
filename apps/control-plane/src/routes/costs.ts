/**
 * Cost Tracking API Routes
 *
 * Admin endpoints for viewing Hetzner resource costs.
 * All endpoints require authentication.
 */

import { Hono } from "hono";
import { getDb } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { createCostService } from "../services/costs.js";

type Variables = {
  userId: string;
};

export const costsRoute = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all routes
costsRoute.use("*", authMiddleware);

/**
 * GET /api/v1/costs/current
 * Get current running costs and hourly burn rate
 */
costsRoute.get("/current", async (c) => {
  const db = getDb();
  const costs = createCostService(db);

  const summary = await costs.getCurrentCosts();

  return c.json({
    currentHourlyBurn: summary.currentHourlyBurn,
    currentHourlyBurnFormatted: `€${summary.currentHourlyBurn.toFixed(4)}/hr`,
    runningServers: summary.runningServers,
    runningVolumes: summary.runningVolumes,
    todayCost: summary.todayCost,
    todayCostFormatted: `€${summary.todayCost.toFixed(4)}`,
    monthCost: summary.monthCost,
    monthCostFormatted: `€${summary.monthCost.toFixed(4)}`,
    projectedMonthCost: summary.currentHourlyBurn * 24 * 30,
    projectedMonthCostFormatted: `€${(summary.currentHourlyBurn * 24 * 30).toFixed(2)}`,
  });
});

/**
 * GET /api/v1/costs/history
 * Get historical costs for a date range
 * Query params: start (YYYY-MM-DD), end (YYYY-MM-DD)
 */
costsRoute.get("/history", async (c) => {
  const db = getDb();
  const costs = createCostService(db);

  const startParam = c.req.query("start");
  const endParam = c.req.query("end");

  // Default to last 30 days
  const endDate = endParam ? new Date(endParam) : new Date();
  const startDate = startParam
    ? new Date(startParam)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const history = await costs.getHistoricalCosts(startDate, endDate);

  // Calculate totals
  const totals = history.reduce(
    (acc, day) => ({
      serverCost: acc.serverCost + day.serverCost,
      volumeCost: acc.volumeCost + day.volumeCost,
      totalCost: acc.totalCost + day.totalCost,
    }),
    { serverCost: 0, volumeCost: 0, totalCost: 0 }
  );

  return c.json({
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    days: history.map((day) => ({
      date: day.date,
      serverCost: day.serverCost,
      volumeCost: day.volumeCost,
      totalCost: day.totalCost,
      totalCostFormatted: `€${day.totalCost.toFixed(4)}`,
    })),
    totals: {
      serverCost: totals.serverCost,
      volumeCost: totals.volumeCost,
      totalCost: totals.totalCost,
      totalCostFormatted: `€${totals.totalCost.toFixed(2)}`,
    },
  });
});

/**
 * GET /api/v1/costs/workspace/:id
 * Get costs for a specific workspace
 */
costsRoute.get("/workspace/:id", async (c) => {
  const db = getDb();
  const costs = createCostService(db);
  const workspaceId = c.req.param("id");

  const workspaceCosts = await costs.getWorkspaceCosts(workspaceId);

  return c.json({
    workspaceId: workspaceCosts.workspaceId,
    totalCost: workspaceCosts.totalCost,
    totalCostFormatted: `€${workspaceCosts.totalCost.toFixed(4)}`,
    serverCost: workspaceCosts.serverCost,
    volumeCost: workspaceCosts.volumeCost,
    runningHours: workspaceCosts.runningHours,
    runningHoursFormatted: `${workspaceCosts.runningHours.toFixed(2)} hours`,
  });
});

/**
 * GET /api/v1/costs/events
 * Get recent cost events (for debugging)
 * Query params: limit (default 50)
 */
costsRoute.get("/events", async (c) => {
  const db = getDb();
  const costs = createCostService(db);
  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  const events = await costs.getRecentEvents(limit);

  return c.json({
    events: events.map((event) => ({
      id: event.id,
      workspaceId: event.workspaceId,
      userId: event.userId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      serverType: event.serverType,
      sizeGb: event.sizeGb,
      eventType: event.eventType,
      hourlyRate: parseFloat(event.hourlyRate),
      hourlyRateFormatted: `€${parseFloat(event.hourlyRate).toFixed(6)}/hr`,
      timestamp: event.timestamp.toISOString(),
    })),
  });
});

/**
 * POST /api/v1/costs/snapshot
 * Trigger daily cost snapshot (for manual runs or cron)
 */
costsRoute.post("/snapshot", async (c) => {
  const db = getDb();
  const costs = createCostService(db);

  const dateParam = c.req.query("date");
  const date = dateParam ? new Date(dateParam) : new Date();

  await costs.snapshotDailyCosts(date);

  return c.json({
    success: true,
    date: date.toISOString().split("T")[0],
    message: "Daily cost snapshot created",
  });
});
