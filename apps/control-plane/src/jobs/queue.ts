/**
 * Job Queue
 *
 * Redis-based job queue using Upstash Redis REST API.
 * Uses LPUSH for enqueueing and RPOPLPUSH for dequeuing with in-progress tracking.
 */

// Read env vars lazily to allow mocking in tests
function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) return null;
  return { url, token };
}

// Queue names
export const QUEUE_NAMES = {
  PROVISION: "ccc:jobs:provision",
  DESTROY: "ccc:jobs:destroy",
  PROCESSING: "ccc:jobs:processing",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Job types
export type JobType = "provision" | "destroy";

export interface BaseJob {
  id: string;
  type: JobType;
  createdAt: string;
  attempts: number;
}

export interface ProvisionJob extends BaseJob {
  type: "provision";
  workspaceId: string;
  userId: string;
}

export interface DestroyJob extends BaseJob {
  type: "destroy";
  workspaceId: string;
  userId: string;
  hetznerServerId?: string;
  hetznerVolumeId?: string;
  tailscaleDeviceId?: string;
}

export type Job = ProvisionJob | DestroyJob;

// Error class
export class QueueError extends Error {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = "QueueError";
  }
}

/**
 * Make a Redis REST API request via Upstash
 */
async function redisCommand<T>(command: string[]): Promise<T> {
  const config = getRedisConfig();
  if (!config) {
    throw new QueueError(
      "Redis configuration missing. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN"
    );
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new QueueError(`Redis command failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { result: T };
  return data.result;
}

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `job_${timestamp}_${random}`;
}

/**
 * Enqueue a provision job
 */
export async function enqueueProvisionJob(params: {
  workspaceId: string;
  userId: string;
}): Promise<ProvisionJob> {
  const job: ProvisionJob = {
    id: generateJobId(),
    type: "provision",
    workspaceId: params.workspaceId,
    userId: params.userId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  await redisCommand(["LPUSH", QUEUE_NAMES.PROVISION, JSON.stringify(job)]);

  return job;
}

/**
 * Enqueue a destroy job
 */
export async function enqueueDestroyJob(params: {
  workspaceId: string;
  userId: string;
  hetznerServerId?: string;
  hetznerVolumeId?: string;
  tailscaleDeviceId?: string;
}): Promise<DestroyJob> {
  const job: DestroyJob = {
    id: generateJobId(),
    type: "destroy",
    workspaceId: params.workspaceId,
    userId: params.userId,
    hetznerServerId: params.hetznerServerId,
    hetznerVolumeId: params.hetznerVolumeId,
    tailscaleDeviceId: params.tailscaleDeviceId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  await redisCommand(["LPUSH", QUEUE_NAMES.DESTROY, JSON.stringify(job)]);

  return job;
}

/**
 * Dequeue a job from a specific queue
 *
 * Uses RPOPLPUSH to atomically move the job to the processing queue.
 * Returns null if the queue is empty.
 */
export async function dequeueJob(queueName: QueueName): Promise<Job | null> {
  const result = await redisCommand<string | null>([
    "RPOPLPUSH",
    queueName,
    QUEUE_NAMES.PROCESSING,
  ]);

  if (!result) {
    return null;
  }

  try {
    const job = JSON.parse(result) as Job;
    job.attempts += 1;
    return job;
  } catch {
    throw new QueueError(`Failed to parse job: ${result}`);
  }
}

/**
 * Mark a job as complete (remove from processing queue)
 */
export async function completeJob(job: Job): Promise<void> {
  await redisCommand([
    "LREM",
    QUEUE_NAMES.PROCESSING,
    "1",
    JSON.stringify({ ...job, attempts: job.attempts - 1 }),
  ]);
}

/**
 * Mark a job as failed (remove from processing and optionally re-queue)
 */
export async function failJob(
  job: Job,
  options: { requeue?: boolean; maxAttempts?: number } = {}
): Promise<void> {
  const { requeue = true, maxAttempts = 3 } = options;
  const originalJob = { ...job, attempts: job.attempts - 1 };

  // Remove from processing queue
  await redisCommand(["LREM", QUEUE_NAMES.PROCESSING, "1", JSON.stringify(originalJob)]);

  // Re-queue if we haven't exceeded max attempts
  if (requeue && job.attempts < maxAttempts) {
    const queueName = job.type === "provision" ? QUEUE_NAMES.PROVISION : QUEUE_NAMES.DESTROY;
    await redisCommand(["LPUSH", queueName, JSON.stringify(job)]);
  }
}

/**
 * Get the length of a queue
 */
export async function getQueueLength(queueName: QueueName): Promise<number> {
  return redisCommand<number>(["LLEN", queueName]);
}

/**
 * Get all jobs in a queue (for monitoring)
 */
export async function getQueueJobs(queueName: QueueName): Promise<Job[]> {
  const results = await redisCommand<string[]>(["LRANGE", queueName, "0", "-1"]);
  return results.map((r) => JSON.parse(r) as Job);
}

/**
 * Check if Redis is configured
 */
export function isQueueConfigured(): boolean {
  return getRedisConfig() !== null;
}
