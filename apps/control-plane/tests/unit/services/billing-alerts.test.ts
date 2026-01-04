/**
 * Billing Alerts Service Tests
 *
 * Tests for alert creation, dismissal, and threshold checking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BillingAlertService } from "../../../src/services/billing-alerts.js";
import { createMockDb, mockInsert, mockUpdate, mockInsertConflict } from "../../helpers/mock-db.js";
import { createMockAlert, resetIdCounter } from "../../helpers/factories.js";
import { freezeTime, unfreezeTime } from "../../helpers/time.js";

describe("BillingAlertService", () => {
  let service: BillingAlertService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    service = new BillingAlertService(
      mockDb as unknown as Parameters<
        typeof BillingAlertService.prototype.createAlert
      >[0] extends object
        ? never
        : ReturnType<typeof createMockDb>
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    unfreezeTime();
  });

  describe("createAlert", () => {
    it("creates new alert", async () => {
      const mockAlert = createMockAlert();
      mockInsert(mockDb, [mockAlert]);

      const result = await service.createAlert({
        userId: "user-123",
        alertType: "usage_50_percent",
        resourceType: "compute",
        message: "50% of your compute time limit",
        billingPeriodStart: new Date("2025-01-01"),
      });

      expect(result).toEqual(mockAlert);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-123",
          alertType: "usage_50_percent",
        })
      );
    });

    it("returns null for duplicate alert (same period/type)", async () => {
      // Simulate onConflictDoNothing returning no rows
      mockDb.returning.mockResolvedValue([]);

      const result = await service.createAlert({
        userId: "user-123",
        alertType: "usage_50_percent",
        resourceType: "compute",
        message: "50% of your compute time limit",
        billingPeriodStart: new Date("2025-01-01"),
      });

      expect(result).toBeNull();
    });

    it("handles duplicate key errors gracefully", async () => {
      mockInsertConflict(mockDb);

      const result = await service.createAlert({
        userId: "user-123",
        alertType: "usage_50_percent",
        resourceType: "compute",
        message: "Duplicate alert",
        billingPeriodStart: new Date("2025-01-01"),
      });

      expect(result).toBeNull();
    });

    it("throws on non-duplicate errors", async () => {
      mockDb.returning.mockRejectedValue(new Error("Database connection error"));

      await expect(
        service.createAlert({
          userId: "user-123",
          alertType: "usage_50_percent",
          message: "Test",
          billingPeriodStart: new Date(),
        })
      ).rejects.toThrow("Database connection error");
    });

    it("stores metadata when provided", async () => {
      const mockAlert = createMockAlert({ metadata: '{"usedPercent":55}' });
      mockInsert(mockDb, [mockAlert]);

      await service.createAlert({
        userId: "user-123",
        alertType: "usage_50_percent",
        message: "50% of your limit",
        billingPeriodStart: new Date(),
        metadata: JSON.stringify({ usedPercent: 55 }),
      });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: '{"usedPercent":55}',
        })
      );
    });
  });

  describe("getActiveAlerts", () => {
    it("returns non-dismissed alerts", async () => {
      const alerts = [
        createMockAlert({ inAppDismissed: false }),
        createMockAlert({ inAppDismissed: false }),
      ];
      mockDb.orderBy.mockResolvedValue(alerts);

      const result = await service.getActiveAlerts("user-123");

      expect(result).toHaveLength(2);
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("returns empty array when no active alerts", async () => {
      mockDb.orderBy.mockResolvedValue([]);

      const result = await service.getActiveAlerts("user-123");

      expect(result).toEqual([]);
    });

    it("orders by newest first", async () => {
      const alerts = [createMockAlert()];
      mockDb.orderBy.mockResolvedValue(alerts);

      await service.getActiveAlerts("user-123");

      expect(mockDb.orderBy).toHaveBeenCalled();
    });
  });

  describe("getAllAlerts", () => {
    it("returns all alerts with default limit", async () => {
      const alerts = [createMockAlert(), createMockAlert()];
      mockDb.limit.mockResolvedValue(alerts);

      const result = await service.getAllAlerts("user-123");

      expect(result).toHaveLength(2);
      expect(mockDb.limit).toHaveBeenCalled();
    });

    it("respects custom limit", async () => {
      mockDb.limit.mockResolvedValue([]);

      await service.getAllAlerts("user-123", 10);

      expect(mockDb.limit).toHaveBeenCalled();
    });
  });

  describe("dismissAlert", () => {
    it("dismisses alert owned by user", async () => {
      mockUpdate(mockDb, [{ id: "alert-123" }]);

      const result = await service.dismissAlert("alert-123", "user-123");

      expect(result).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          inAppDismissed: true,
        })
      );
    });

    it("returns false for non-existent alert", async () => {
      mockUpdate(mockDb, []);

      const result = await service.dismissAlert("nonexistent", "user-123");

      expect(result).toBe(false);
    });

    it("returns false when user does not own alert", async () => {
      // No rows returned because userId doesn't match
      mockUpdate(mockDb, []);

      const result = await service.dismissAlert("alert-123", "wrong-user");

      expect(result).toBe(false);
    });

    it("sets dismissedAt timestamp", async () => {
      freezeTime(new Date("2025-01-15T10:00:00Z"));
      mockUpdate(mockDb, [{ id: "alert-123" }]);

      await service.dismissAlert("alert-123", "user-123");

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          inAppDismissedAt: expect.any(Date),
        })
      );
    });
  });

  describe("markEmailSent", () => {
    it("marks alert as email sent", async () => {
      await service.markEmailSent("alert-123");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          emailSent: true,
        })
      );
    });

    it("sets emailSentAt timestamp", async () => {
      freezeTime(new Date("2025-01-15T10:00:00Z"));

      await service.markEmailSent("alert-123");

      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          emailSentAt: expect.any(Date),
        })
      );
    });
  });

  describe("checkUsageThresholds", () => {
    it("creates 50% alert when threshold reached", async () => {
      mockInsert(mockDb, [createMockAlert()]);

      await service.checkUsageThresholds({
        userId: "user-123",
        resourceType: "compute",
        usedPercent: 55,
        billingPeriodStart: new Date("2025-01-01"),
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: "usage_50_percent",
        })
      );
    });

    it("creates 80% alert when threshold reached", async () => {
      mockInsert(mockDb, [createMockAlert()]);

      await service.checkUsageThresholds({
        userId: "user-123",
        resourceType: "storage",
        usedPercent: 85,
        billingPeriodStart: new Date("2025-01-01"),
      });

      // Should create both 50% and 80% alerts
      expect(mockDb.values).toHaveBeenCalledTimes(2);
    });

    it("creates 100% alert when threshold reached", async () => {
      mockInsert(mockDb, [createMockAlert()]);

      await service.checkUsageThresholds({
        userId: "user-123",
        resourceType: "voice",
        usedPercent: 100,
        billingPeriodStart: new Date("2025-01-01"),
      });

      // Should create 50%, 80%, and 100% alerts
      expect(mockDb.values).toHaveBeenCalledTimes(3);
    });

    it("uses correct resource label in message", async () => {
      mockInsert(mockDb, [createMockAlert()]);

      await service.checkUsageThresholds({
        userId: "user-123",
        resourceType: "voice",
        usedPercent: 55,
        billingPeriodStart: new Date("2025-01-01"),
      });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "50% of your voice minutes limit",
        })
      );
    });

    it("stores usage metadata in alert", async () => {
      mockInsert(mockDb, [createMockAlert()]);

      await service.checkUsageThresholds({
        userId: "user-123",
        resourceType: "compute",
        usedPercent: 75,
        billingPeriodStart: new Date("2025-01-01"),
      });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.stringContaining("usedPercent"),
        })
      );
    });
  });

  describe("countActiveAlerts", () => {
    it("returns count of active alerts", async () => {
      const alerts = [{ count: "alert-1" }, { count: "alert-2" }, { count: "alert-3" }];
      mockDb.where.mockResolvedValue(alerts);

      const result = await service.countActiveAlerts("user-123");

      expect(result).toBe(3);
    });

    it("returns 0 when no active alerts", async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await service.countActiveAlerts("user-123");

      expect(result).toBe(0);
    });
  });
});
