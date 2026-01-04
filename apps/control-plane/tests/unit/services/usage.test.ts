/**
 * Usage Service Tests
 *
 * Tests for usage tracking, idempotency, and Stripe meter sync.
 * Note: Complex query chains are tested via integration tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UsageService } from "../../../src/services/usage.js";
import { createMockDb, mockInsert, resetMockDb } from "../../helpers/mock-db.js";
import { createMockUsageEvent, resetIdCounter } from "../../helpers/factories.js";
import { freezeTime, unfreezeTime } from "../../helpers/time.js";

// Mock the stripe module
vi.mock("../../../src/lib/stripe.js", () => ({
  stripe: {
    billing: {
      meterEvents: {
        create: vi.fn().mockResolvedValue({ identifier: "mtr_evt_123" }),
      },
    },
  },
  isStripeConfigured: vi.fn().mockReturnValue(true),
  STRIPE_METERS: {
    computeMinute: "mtr_compute",
    storageGbHour: "mtr_storage",
    voiceSecond: "mtr_voice",
  },
}));

describe("UsageService", () => {
  let service: UsageService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    service = new UsageService(mockDb as never);
    vi.clearAllMocks();
  });

  afterEach(() => {
    unfreezeTime();
  });

  describe("recordUsage", () => {
    it("records new usage event", async () => {
      mockInsert(mockDb, [createMockUsageEvent()]);

      const result = await service.recordUsage({
        userId: "user-123",
        workspaceId: "ws-123",
        eventType: "compute_minute",
        quantity: 1,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        idempotencyKey: "test-key-1",
      });

      expect(result).toBe(true);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
    });

    it("returns false for duplicate idempotency key (unique constraint)", async () => {
      // Simulate unique constraint violation by making insert throw
      mockDb.values.mockImplementation(() => {
        throw new Error("duplicate key value violates unique constraint");
      });

      const result = await service.recordUsage({
        userId: "user-123",
        workspaceId: "ws-123",
        eventType: "compute_minute",
        quantity: 1,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        idempotencyKey: "duplicate-key",
      });

      expect(result).toBe(false);
    });

    it("throws on non-duplicate errors", async () => {
      mockDb.values.mockImplementation(() => {
        throw new Error("Database connection error");
      });

      await expect(
        service.recordUsage({
          userId: "user-123",
          workspaceId: "ws-123",
          eventType: "compute_minute",
          quantity: 1,
          billingPeriodStart: new Date(),
          billingPeriodEnd: new Date(),
          idempotencyKey: "test-key",
        })
      ).rejects.toThrow("Database connection error");
    });
  });

  describe("recordComputeMinute", () => {
    it("records compute minute with correct idempotency key", async () => {
      freezeTime(new Date("2025-01-15T10:30:00Z"));
      mockInsert(mockDb, [createMockUsageEvent()]);

      const periodStart = new Date("2025-01-01");
      const periodEnd = new Date("2025-02-01");

      const result = await service.recordComputeMinute({
        userId: "user-123",
        workspaceId: "ws-456",
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
      });

      expect(result).toBe(true);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "compute_minute",
          quantity: "1",
        })
      );
    });

    it("uses minute-based idempotency key format", async () => {
      const timestamp = new Date("2025-01-15T10:30:00Z");
      freezeTime(timestamp);
      mockInsert(mockDb, [createMockUsageEvent()]);

      await service.recordComputeMinute({
        userId: "user-123",
        workspaceId: "ws-456",
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
      });

      const minuteKey = Math.floor(timestamp.getTime() / 60000);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `compute:ws-456:${minuteKey}`,
        })
      );
    });
  });

  describe("recordStorageGbHour", () => {
    it("records storage usage with volume-based idempotency key", async () => {
      const timestamp = new Date("2025-01-15T10:00:00Z");
      freezeTime(timestamp);
      mockInsert(mockDb, [createMockUsageEvent()]);

      const result = await service.recordStorageGbHour({
        userId: "user-123",
        workspaceId: "ws-456",
        volumeId: "vol-789",
        sizeGb: 50,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
      });

      expect(result).toBe(true);

      // Verify idempotency key uses volumeId (not workspaceId)
      const hourKey = Math.floor(timestamp.getTime() / 3600000);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `storage:vol-789:${hourKey}`,
          quantity: "50",
        })
      );
    });

    it("handles multiple volumes per workspace with different keys", async () => {
      const timestamp = new Date("2025-01-15T10:00:00Z");
      freezeTime(timestamp);

      // First volume
      mockInsert(mockDb, [createMockUsageEvent()]);
      await service.recordStorageGbHour({
        userId: "user-123",
        workspaceId: "ws-456",
        volumeId: "vol-1",
        sizeGb: 25,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
      });

      const hourKey = Math.floor(timestamp.getTime() / 3600000);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `storage:vol-1:${hourKey}`,
        })
      );

      // Reset for second volume
      resetMockDb(mockDb);
      mockInsert(mockDb, [createMockUsageEvent()]);

      await service.recordStorageGbHour({
        userId: "user-123",
        workspaceId: "ws-456",
        volumeId: "vol-2",
        sizeGb: 25,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
      });

      // Different volume ID = different idempotency key
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `storage:vol-2:${hourKey}`,
        })
      );
    });
  });

  describe("recordVoiceSeconds", () => {
    it("records voice usage with session-based idempotency", async () => {
      mockInsert(mockDb, [createMockUsageEvent()]);

      const result = await service.recordVoiceSeconds({
        userId: "user-123",
        seconds: 120,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        sessionId: "voice-session-abc",
      });

      expect(result).toBe(true);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "voice_second",
          quantity: "120",
          idempotencyKey: "voice:voice-session-abc",
        })
      );
    });

    it("allows workspace to be optional", async () => {
      mockInsert(mockDb, [createMockUsageEvent()]);

      await service.recordVoiceSeconds({
        userId: "user-123",
        seconds: 60,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        sessionId: "session-1",
      });

      // workspaceId is optional for voice
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "voice_second",
        })
      );
    });
  });

  describe("syncToStripeMeter", () => {
    it("returns 0 when Stripe not configured", async () => {
      const { isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(false);

      const result = await service.syncToStripeMeter(10);

      expect(result).toBe(0);
    });

    it("returns 0 when no pending events", async () => {
      const { isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(true);

      mockDb.limit.mockResolvedValue([]);

      const result = await service.syncToStripeMeter(10);

      expect(result).toBe(0);
    });
  });

  describe("Idempotency Key Formats", () => {
    it("compute uses workspace:minute format", async () => {
      const now = new Date("2025-01-15T10:30:45Z");
      freezeTime(now);
      mockInsert(mockDb, [createMockUsageEvent()]);

      await service.recordComputeMinute({
        userId: "user-1",
        workspaceId: "ws-abc",
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
      });

      const minuteKey = Math.floor(now.getTime() / 60000);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `compute:ws-abc:${minuteKey}`,
        })
      );
    });

    it("storage uses volume:hour format", async () => {
      const now = new Date("2025-01-15T10:30:45Z");
      freezeTime(now);
      mockInsert(mockDb, [createMockUsageEvent()]);

      await service.recordStorageGbHour({
        userId: "user-1",
        workspaceId: "ws-abc",
        volumeId: "vol-xyz",
        sizeGb: 10,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
      });

      const hourKey = Math.floor(now.getTime() / 3600000);
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `storage:vol-xyz:${hourKey}`,
        })
      );
    });

    it("voice uses session format", async () => {
      mockInsert(mockDb, [createMockUsageEvent()]);

      await service.recordVoiceSeconds({
        userId: "user-1",
        seconds: 30,
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        sessionId: "session-unique-id",
      });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: "voice:session-unique-id",
        })
      );
    });
  });
});
