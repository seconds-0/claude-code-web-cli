/**
 * Subscription Service Tests
 *
 * Tests for subscription management, Stripe integration, and plan enforcement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SubscriptionService } from "../../../src/services/subscription.js";
import { createMockDb, mockSelect, mockInsert, resetMockDb } from "../../helpers/mock-db.js";
import {
  createMockSubscription,
  createMockFreeSubscription,
  createMockStripeSubscription,
  resetIdCounter,
} from "../../helpers/factories.js";
import { freezeTime, unfreezeTime, startOfMonth } from "../../helpers/time.js";

// Mock the stripe module
vi.mock("../../../src/lib/stripe.js", () => ({
  stripe: {
    customers: {
      create: vi.fn().mockResolvedValue({ id: "cus_mock_123" }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session" }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/portal" }),
      },
    },
  },
  isStripeConfigured: vi.fn().mockReturnValue(true),
  STRIPE_PRICES: {
    starter: "price_starter",
    pro: "price_pro",
    unlimited: "price_unlimited",
  },
  getPlanFromPriceId: vi.fn((priceId: string) => {
    const map: Record<string, string> = {
      price_starter: "starter",
      price_pro: "pro",
      price_unlimited: "unlimited",
    };
    return map[priceId] || "free";
  }),
  getPlanConfig: vi.fn((plan: string) => {
    const configs: Record<
      string,
      {
        computeMinutesLimit: number | null;
        storageGbLimit: number | null;
        voiceSecondsLimit: number | null;
      }
    > = {
      free: { computeMinutesLimit: 300, storageGbLimit: 10, voiceSecondsLimit: 1800 },
      starter: { computeMinutesLimit: 1800, storageGbLimit: 25, voiceSecondsLimit: 1800 },
      pro: { computeMinutesLimit: 6000, storageGbLimit: 50, voiceSecondsLimit: 7200 },
      unlimited: { computeMinutesLimit: null, storageGbLimit: 100, voiceSecondsLimit: 30000 },
    };
    return configs[plan] || configs["free"];
  }),
}));

describe("SubscriptionService", () => {
  let service: SubscriptionService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    resetIdCounter();
    mockDb = createMockDb();
    service = new SubscriptionService(
      mockDb as unknown as Parameters<
        typeof SubscriptionService.prototype.getSubscription
      >[0] extends string
        ? never
        : Parameters<typeof createMockDb>[0] extends undefined
          ? ReturnType<typeof createMockDb>
          : never
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    unfreezeTime();
  });

  describe("getSubscription", () => {
    it("returns subscription when found", async () => {
      const mockSub = createMockSubscription({ userId: "user-123" });
      mockSelect(mockDb, [mockSub]);

      const result = await service.getSubscription("user-123");

      expect(result).toEqual(mockSub);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it("returns null when subscription not found", async () => {
      mockSelect(mockDb, []);

      const result = await service.getSubscription("nonexistent-user");

      expect(result).toBeNull();
    });
  });

  describe("getSubscriptionByCustomerId", () => {
    it("returns subscription when found", async () => {
      const mockSub = createMockSubscription({ stripeCustomerId: "cus_123" });
      mockSelect(mockDb, [mockSub]);

      const result = await service.getSubscriptionByCustomerId("cus_123");

      expect(result).toEqual(mockSub);
    });

    it("returns null when customer not found", async () => {
      mockSelect(mockDb, []);

      const result = await service.getSubscriptionByCustomerId("cus_nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("createSubscription", () => {
    it("creates subscription with Stripe customer when Stripe is configured", async () => {
      const { stripe, isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(true);

      const mockSub = createMockSubscription({ userId: "user-123", plan: "free" });
      mockInsert(mockDb, [mockSub]);

      const result = await service.createSubscription({
        userId: "user-123",
        email: "test@example.com",
      });

      expect(stripe!.customers.create).toHaveBeenCalledWith({
        email: "test@example.com",
        metadata: { userId: "user-123" },
      });
      expect(result).toEqual(mockSub);
    });

    it("creates local subscription when Stripe is not configured", async () => {
      const { isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(false);

      const mockSub = createMockSubscription({ stripeCustomerId: "local_user-123" });
      mockInsert(mockDb, [mockSub]);

      await service.createSubscription({
        userId: "user-123",
        email: "test@example.com",
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
    });

    it("uses specified plan when provided", async () => {
      const mockSub = createMockSubscription({ plan: "pro" });
      mockInsert(mockDb, [mockSub]);

      await service.createSubscription({
        userId: "user-123",
        email: "test@example.com",
        plan: "pro",
      });

      expect(mockDb.values).toHaveBeenCalled();
    });

    it("defaults to free plan when not specified", async () => {
      const { getPlanConfig } = await import("../../../src/lib/stripe.js");
      const mockSub = createMockFreeSubscription();
      mockInsert(mockDb, [mockSub]);

      await service.createSubscription({
        userId: "user-123",
        email: "test@example.com",
      });

      expect(getPlanConfig).toHaveBeenCalledWith("free");
    });
  });

  describe("ensureSubscription", () => {
    it("returns existing subscription if found", async () => {
      const mockSub = createMockSubscription({ userId: "user-123" });
      mockSelect(mockDb, [mockSub]);

      const result = await service.ensureSubscription("user-123", "test@example.com");

      expect(result).toEqual(mockSub);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("creates new subscription if not found", async () => {
      // First call returns empty (no existing subscription)
      mockDb.limit.mockResolvedValueOnce([]);

      const newSub = createMockSubscription();
      mockInsert(mockDb, [newSub]);

      const result = await service.ensureSubscription("user-123", "test@example.com");

      expect(result).toEqual(newSub);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe("createCheckoutSession", () => {
    it("creates checkout session for valid plan", async () => {
      const { stripe, isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(true);

      const mockSub = createMockSubscription();
      mockSelect(mockDb, [mockSub]);

      const result = await service.createCheckoutSession({
        userId: "user-123",
        plan: "starter",
        successUrl: "https://app.example.com/success",
        cancelUrl: "https://app.example.com/cancel",
      });

      expect(result).toBe("https://checkout.stripe.com/session");
      expect(stripe!.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: mockSub.stripeCustomerId,
          mode: "subscription",
        })
      );
    });

    it("returns null when Stripe is not configured", async () => {
      const { isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(false);

      const result = await service.createCheckoutSession({
        userId: "user-123",
        plan: "starter",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(result).toBeNull();
    });

    it("throws error for invalid plan", async () => {
      const { isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(true);

      const mockSub = createMockSubscription();
      mockSelect(mockDb, [mockSub]);

      await expect(
        service.createCheckoutSession({
          userId: "user-123",
          plan: "invalid_plan",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        })
      ).rejects.toThrow("Invalid plan: invalid_plan");
    });

    it("throws error when user has no subscription", async () => {
      const { isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(true);

      mockSelect(mockDb, []);

      await expect(
        service.createCheckoutSession({
          userId: "user-123",
          plan: "starter",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        })
      ).rejects.toThrow("User has no subscription");
    });
  });

  describe("createPortalSession", () => {
    it("creates portal session for existing customer", async () => {
      const { stripe, isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(true);

      const mockSub = createMockSubscription();
      mockSelect(mockDb, [mockSub]);

      const result = await service.createPortalSession({
        userId: "user-123",
        returnUrl: "https://app.example.com/billing",
      });

      expect(result).toBe("https://billing.stripe.com/portal");
      expect(stripe!.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: mockSub.stripeCustomerId,
        return_url: "https://app.example.com/billing",
      });
    });

    it("returns null when Stripe is not configured", async () => {
      const { isStripeConfigured } = await import("../../../src/lib/stripe.js");
      vi.mocked(isStripeConfigured).mockReturnValue(false);

      const result = await service.createPortalSession({
        userId: "user-123",
        returnUrl: "https://example.com/billing",
      });

      expect(result).toBeNull();
    });
  });

  describe("syncFromStripe", () => {
    it("syncs subscription with all fields", async () => {
      const mockSub = createMockSubscription({ stripeCustomerId: "cus_123" });
      mockSelect(mockDb, [mockSub]);
      mockDb.returning.mockResolvedValue([]);

      const stripeSub = createMockStripeSubscription({
        customer: "cus_123",
        status: "active",
      });

      await service.syncFromStripe(stripeSub);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });

    it("maps Stripe status to internal status correctly", async () => {
      const mockSub = createMockSubscription({ stripeCustomerId: "cus_123" });
      mockSelect(mockDb, [mockSub]);

      const statusTests = [
        { stripeStatus: "active", expectedStatus: "active" },
        { stripeStatus: "past_due", expectedStatus: "past_due" },
        { stripeStatus: "canceled", expectedStatus: "canceled" },
        { stripeStatus: "trialing", expectedStatus: "trialing" },
        { stripeStatus: "incomplete_expired", expectedStatus: "canceled" },
        { stripeStatus: "unpaid", expectedStatus: "past_due" },
      ];

      for (const { stripeStatus } of statusTests) {
        resetMockDb(mockDb);
        mockSelect(mockDb, [mockSub]);

        const stripeSub = createMockStripeSubscription({
          customer: "cus_123",
          status: stripeStatus,
        });

        await service.syncFromStripe(stripeSub);

        expect(mockDb.set).toHaveBeenCalled();
      }
    });

    it("converts period timestamps to dates", async () => {
      const mockSub = createMockSubscription({ stripeCustomerId: "cus_123" });
      mockSelect(mockDb, [mockSub]);

      const now = Math.floor(Date.now() / 1000);
      const periodEnd = now + 30 * 24 * 60 * 60;

      const stripeSub = createMockStripeSubscription({
        customer: "cus_123",
        current_period_start: now,
        current_period_end: periodEnd,
      });

      await service.syncFromStripe(stripeSub);

      expect(mockDb.set).toHaveBeenCalled();
    });

    it("handles missing subscription gracefully", async () => {
      mockSelect(mockDb, []);

      const stripeSub = createMockStripeSubscription({ customer: "cus_nonexistent" });

      // Should not throw
      await service.syncFromStripe(stripeSub);

      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("defaults to free plan when price ID is missing", async () => {
      const { getPlanConfig } = await import("../../../src/lib/stripe.js");
      const mockSub = createMockSubscription({ stripeCustomerId: "cus_123" });
      mockSelect(mockDb, [mockSub]);

      const stripeSub = createMockStripeSubscription({
        customer: "cus_123",
        items: { data: [] }, // Empty items array
      });

      await service.syncFromStripe(stripeSub);

      // Should use existing plan since no price ID
      expect(getPlanConfig).toHaveBeenCalled();
    });
  });

  describe("handleCancellation", () => {
    it("downgrades to free plan", async () => {
      const { getPlanConfig } = await import("../../../src/lib/stripe.js");
      const mockSub = createMockSubscription({ stripeCustomerId: "cus_123", plan: "pro" });
      mockSelect(mockDb, [mockSub]);

      await service.handleCancellation("cus_123");

      expect(getPlanConfig).toHaveBeenCalledWith("free");
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });

    it("handles non-existent customer gracefully", async () => {
      mockSelect(mockDb, []);

      // Should not throw
      await service.handleCancellation("cus_nonexistent");

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe("enableOverages", () => {
    it("enables overages for user", async () => {
      await service.enableOverages("user-123");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });

    it("stores payment method ID when provided", async () => {
      await service.enableOverages("user-123", "pm_123");

      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe("disableOverages", () => {
    it("disables overages for user", async () => {
      await service.disableOverages("user-123");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe("resetPeriod", () => {
    it("resets period to next month", async () => {
      freezeTime(startOfMonth(2025, 1));

      const mockSub = createMockSubscription({ userId: "user-123" });
      mockSelect(mockDb, [mockSub]);

      await service.resetPeriod("user-123");

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });

    it("handles non-existent subscription gracefully", async () => {
      mockSelect(mockDb, []);

      // Should not throw
      await service.resetPeriod("nonexistent");

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe("getUserPlanConfig", () => {
    it("returns plan config for user", async () => {
      const { getPlanConfig } = await import("../../../src/lib/stripe.js");
      const mockSub = createMockSubscription({ plan: "pro" });
      mockSelect(mockDb, [mockSub]);

      const result = await service.getUserPlanConfig("user-123");

      expect(getPlanConfig).toHaveBeenCalledWith("pro");
      expect(result).toBeDefined();
    });

    it("returns null when no subscription", async () => {
      mockSelect(mockDb, []);

      const result = await service.getUserPlanConfig("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getBillingPeriod", () => {
    it("returns billing period for user", async () => {
      const periodStart = new Date("2025-01-01");
      const periodEnd = new Date("2025-02-01");
      const mockSub = createMockSubscription({
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });
      mockSelect(mockDb, [mockSub]);

      const result = await service.getBillingPeriod("user-123");

      expect(result).toEqual({
        start: periodStart,
        end: periodEnd,
      });
    });

    it("returns null when no subscription", async () => {
      mockSelect(mockDb, []);

      const result = await service.getBillingPeriod("nonexistent");

      expect(result).toBeNull();
    });
  });
});
