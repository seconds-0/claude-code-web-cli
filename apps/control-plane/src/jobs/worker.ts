/**
 * Job Worker
 *
 * Polls the job queues and processes jobs using registered handlers.
 */

import {
  dequeueJob,
  completeJob,
  failJob,
  QUEUE_NAMES,
  isQueueConfigured,
  type Job,
  type ProvisionJob,
  type DestroyJob,
  type QueueName,
} from "./queue.js";

// Handler types
export type ProvisionHandler = (job: ProvisionJob) => Promise<void>;
export type DestroyHandler = (job: DestroyJob) => Promise<void>;

interface WorkerConfig {
  pollIntervalMs?: number;
  maxConcurrent?: number;
  onError?: (error: Error, job?: Job) => void;
  onJobComplete?: (job: Job) => void;
}

// Worker state
let isRunning = false;
let activeJobs = 0;
let provisionHandler: ProvisionHandler | null = null;
let destroyHandler: DestroyHandler | null = null;

/**
 * Register a handler for provision jobs
 */
export function registerProvisionHandler(handler: ProvisionHandler): void {
  provisionHandler = handler;
}

/**
 * Register a handler for destroy jobs
 */
export function registerDestroyHandler(handler: DestroyHandler): void {
  destroyHandler = handler;
}

/**
 * Process a single job
 */
async function processJob(job: Job, config: WorkerConfig): Promise<void> {
  try {
    if (job.type === "provision") {
      if (!provisionHandler) {
        throw new Error("No provision handler registered");
      }
      await provisionHandler(job);
    } else if (job.type === "destroy") {
      if (!destroyHandler) {
        throw new Error("No destroy handler registered");
      }
      await destroyHandler(job);
    } else {
      throw new Error(`Unknown job type: ${(job as { type: string }).type}`);
    }

    await completeJob(job);
    config.onJobComplete?.(job);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    config.onError?.(err, job);
    await failJob(job, { requeue: true, maxAttempts: 3 });
  }
}

/**
 * Poll a single queue for jobs
 */
async function pollQueue(queueName: QueueName, config: WorkerConfig): Promise<void> {
  const { maxConcurrent = 5 } = config;

  // Check if we can process more jobs
  if (activeJobs >= maxConcurrent) {
    return;
  }

  try {
    const job = await dequeueJob(queueName);

    if (job) {
      activeJobs++;
      // Process job in background (don't await)
      processJob(job, config)
        .finally(() => {
          activeJobs--;
        })
        .catch((err) => {
          config.onError?.(err instanceof Error ? err : new Error(String(err)), job);
        });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    config.onError?.(err);
  }
}

/**
 * Main worker loop
 */
async function workerLoop(config: WorkerConfig): Promise<void> {
  const { pollIntervalMs = 1000 } = config;

  while (isRunning) {
    // Poll both queues
    await Promise.all([
      pollQueue(QUEUE_NAMES.PROVISION, config),
      pollQueue(QUEUE_NAMES.DESTROY, config),
    ]);

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

/**
 * Start the worker
 */
export function startWorker(config: WorkerConfig = {}): void {
  if (!isQueueConfigured()) {
    console.warn(
      "Job queue not configured - worker not started. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
    );
    return;
  }

  if (isRunning) {
    console.warn("Worker is already running");
    return;
  }

  isRunning = true;
  console.log("Job worker started");

  // Start the worker loop
  workerLoop(config).catch((err) => {
    console.error("Worker loop error:", err);
    isRunning = false;
  });
}

/**
 * Stop the worker gracefully
 */
export async function stopWorker(
  options: { waitForJobs?: boolean; timeoutMs?: number } = {}
): Promise<void> {
  const { waitForJobs = true, timeoutMs = 30000 } = options;

  isRunning = false;

  if (waitForJobs && activeJobs > 0) {
    const startTime = Date.now();

    while (activeJobs > 0 && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (activeJobs > 0) {
      console.warn(`Worker stopped with ${activeJobs} active jobs`);
    }
  }

  console.log("Job worker stopped");
}

/**
 * Get worker status
 */
export function getWorkerStatus(): {
  isRunning: boolean;
  activeJobs: number;
  hasProvisionHandler: boolean;
  hasDestroyHandler: boolean;
} {
  return {
    isRunning,
    activeJobs,
    hasProvisionHandler: !!provisionHandler,
    hasDestroyHandler: !!destroyHandler,
  };
}
