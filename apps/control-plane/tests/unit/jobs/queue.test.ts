import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enqueueProvisionJob,
  enqueueDestroyJob,
  dequeueJob,
  completeJob,
  failJob,
  getQueueLength,
  getQueueJobs,
  isQueueConfigured,
  QUEUE_NAMES,
  type ProvisionJob,
} from "../../../src/jobs/queue.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Job Queue", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      UPSTASH_REDIS_REST_URL: "https://test-redis.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    };
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("isQueueConfigured", () => {
    it("returns true when both env vars are set", () => {
      expect(isQueueConfigured()).toBe(true);
    });

    it("returns false when URL is missing", () => {
      delete process.env["UPSTASH_REDIS_REST_URL"];
      expect(isQueueConfigured()).toBe(false);
    });

    it("returns false when token is missing", () => {
      delete process.env["UPSTASH_REDIS_REST_TOKEN"];
      expect(isQueueConfigured()).toBe(false);
    });
  });

  describe("enqueueProvisionJob", () => {
    it("enqueues a provision job", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: 1 }),
      });

      const job = await enqueueProvisionJob({
        workspaceId: "workspace-123",
        userId: "user-456",
      });

      expect(job.id).toMatch(/^job_/);
      expect(job.type).toBe("provision");
      expect(job.workspaceId).toBe("workspace-123");
      expect(job.userId).toBe("user-456");
      expect(job.attempts).toBe(0);
      expect(job.createdAt).toBeDefined();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-redis.upstash.io",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          },
        })
      );

      const requestBody = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] &&
          ((mockFetch.mock.calls[0] as unknown[])[1] as { body?: string })?.body) ||
          "[]"
      );
      expect(requestBody[0]).toBe("LPUSH");
      expect(requestBody[1]).toBe(QUEUE_NAMES.PROVISION);
    });
  });

  describe("enqueueDestroyJob", () => {
    it("enqueues a destroy job with all fields", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: 1 }),
      });

      const job = await enqueueDestroyJob({
        workspaceId: "workspace-123",
        userId: "user-456",
        hetznerServerId: "server-789",
        hetznerVolumeId: "volume-101",
        tailscaleDeviceId: "device-102",
      });

      expect(job.id).toMatch(/^job_/);
      expect(job.type).toBe("destroy");
      expect(job.workspaceId).toBe("workspace-123");
      expect(job.hetznerServerId).toBe("server-789");
      expect(job.hetznerVolumeId).toBe("volume-101");
      expect(job.tailscaleDeviceId).toBe("device-102");
    });

    it("enqueues a destroy job with optional fields", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: 1 }),
      });

      const job = await enqueueDestroyJob({
        workspaceId: "workspace-123",
        userId: "user-456",
      });

      expect(job.hetznerServerId).toBeUndefined();
      expect(job.hetznerVolumeId).toBeUndefined();
    });
  });

  describe("dequeueJob", () => {
    it("dequeues a job from the queue", async () => {
      const mockJob: ProvisionJob = {
        id: "job_abc123",
        type: "provision",
        workspaceId: "workspace-123",
        userId: "user-456",
        createdAt: "2024-01-01T00:00:00Z",
        attempts: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: JSON.stringify(mockJob) }),
      });

      const job = await dequeueJob(QUEUE_NAMES.PROVISION);

      expect(job).not.toBeNull();
      expect(job?.id).toBe("job_abc123");
      expect(job?.type).toBe("provision");
      expect(job?.attempts).toBe(1); // Should be incremented

      const requestBody = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] &&
          ((mockFetch.mock.calls[0] as unknown[])[1] as { body?: string })?.body) ||
          "[]"
      );
      expect(requestBody[0]).toBe("RPOPLPUSH");
      expect(requestBody[1]).toBe(QUEUE_NAMES.PROVISION);
      expect(requestBody[2]).toBe(QUEUE_NAMES.PROCESSING);
    });

    it("returns null when queue is empty", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: null }),
      });

      const job = await dequeueJob(QUEUE_NAMES.PROVISION);
      expect(job).toBeNull();
    });
  });

  describe("completeJob", () => {
    it("removes job from processing queue", async () => {
      const job: ProvisionJob = {
        id: "job_abc123",
        type: "provision",
        workspaceId: "workspace-123",
        userId: "user-456",
        createdAt: "2024-01-01T00:00:00Z",
        attempts: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: 1 }),
      });

      await completeJob(job);

      const requestBody = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] &&
          ((mockFetch.mock.calls[0] as unknown[])[1] as { body?: string })?.body) ||
          "[]"
      );
      expect(requestBody[0]).toBe("LREM");
      expect(requestBody[1]).toBe(QUEUE_NAMES.PROCESSING);
    });
  });

  describe("failJob", () => {
    it("removes from processing and re-queues by default", async () => {
      const job: ProvisionJob = {
        id: "job_abc123",
        type: "provision",
        workspaceId: "workspace-123",
        userId: "user-456",
        createdAt: "2024-01-01T00:00:00Z",
        attempts: 1,
      };

      // First call: LREM
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: 1 }),
      });
      // Second call: LPUSH
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: 1 }),
      });

      await failJob(job);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Check second call is LPUSH to provision queue
      const secondCallBody = JSON.parse(
        ((mockFetch.mock.calls[1] as unknown[])[1] &&
          ((mockFetch.mock.calls[1] as unknown[])[1] as { body?: string })?.body) ||
          "[]"
      );
      expect(secondCallBody[0]).toBe("LPUSH");
      expect(secondCallBody[1]).toBe(QUEUE_NAMES.PROVISION);
    });

    it("does not re-queue if max attempts exceeded", async () => {
      const job: ProvisionJob = {
        id: "job_abc123",
        type: "provision",
        workspaceId: "workspace-123",
        userId: "user-456",
        createdAt: "2024-01-01T00:00:00Z",
        attempts: 3, // At max
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: 1 }),
      });

      await failJob(job, { maxAttempts: 3 });

      expect(mockFetch).toHaveBeenCalledTimes(1); // Only LREM, no LPUSH
    });

    it("does not re-queue if requeue is false", async () => {
      const job: ProvisionJob = {
        id: "job_abc123",
        type: "provision",
        workspaceId: "workspace-123",
        userId: "user-456",
        createdAt: "2024-01-01T00:00:00Z",
        attempts: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: 1 }),
      });

      await failJob(job, { requeue: false });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("getQueueLength", () => {
    it("returns queue length", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: 5 }),
      });

      const length = await getQueueLength(QUEUE_NAMES.PROVISION);
      expect(length).toBe(5);

      const requestBody = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] &&
          ((mockFetch.mock.calls[0] as unknown[])[1] as { body?: string })?.body) ||
          "[]"
      );
      expect(requestBody[0]).toBe("LLEN");
      expect(requestBody[1]).toBe(QUEUE_NAMES.PROVISION);
    });
  });

  describe("getQueueJobs", () => {
    it("returns all jobs in queue", async () => {
      const mockJobs = [
        JSON.stringify({
          id: "job_1",
          type: "provision",
          workspaceId: "ws-1",
          userId: "user-1",
          createdAt: "2024-01-01T00:00:00Z",
          attempts: 0,
        }),
        JSON.stringify({
          id: "job_2",
          type: "provision",
          workspaceId: "ws-2",
          userId: "user-2",
          createdAt: "2024-01-01T00:00:01Z",
          attempts: 0,
        }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: mockJobs }),
      });

      const jobs = await getQueueJobs(QUEUE_NAMES.PROVISION);

      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe("job_1");
      expect(jobs[1].id).toBe("job_2");

      const requestBody = JSON.parse(
        ((mockFetch.mock.calls[0] as unknown[])[1] &&
          ((mockFetch.mock.calls[0] as unknown[])[1] as { body?: string })?.body) ||
          "[]"
      );
      expect(requestBody[0]).toBe("LRANGE");
      expect(requestBody[1]).toBe(QUEUE_NAMES.PROVISION);
      expect(requestBody[2]).toBe("0");
      expect(requestBody[3]).toBe("-1");
    });
  });

  describe("error handling", () => {
    it("throws QueueError when Redis config is missing", async () => {
      delete process.env["UPSTASH_REDIS_REST_URL"];

      await expect(enqueueProvisionJob({ workspaceId: "ws-1", userId: "user-1" })).rejects.toThrow(
        "Redis configuration missing"
      );
    });

    it("throws QueueError when Redis request fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      await expect(enqueueProvisionJob({ workspaceId: "ws-1", userId: "user-1" })).rejects.toThrow(
        "Redis command failed"
      );
    });
  });
});
