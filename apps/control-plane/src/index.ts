import { createServer, type Server } from "http";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { createTerminalWebSocketServer } from "./websocket/terminal.js";
import { registerProvisionHandler, registerDestroyHandler, startWorker } from "./jobs/worker.js";
import { handleProvisionJob } from "./jobs/handlers/provision.js";
import { handleDestroyJob } from "./jobs/handlers/destroy.js";

const port = parseInt(process.env["PORT"] || "8080", 10);

console.log(`Starting control-plane on port ${port}`);

// Create HTTP server
const server = serve({
  fetch: app.fetch,
  port,
  createServer,
});

// Attach WebSocket server for terminal connections
createTerminalWebSocketServer(server as Server);

// Register job handlers and start worker
registerProvisionHandler(handleProvisionJob);
registerDestroyHandler(handleDestroyJob);
startWorker({
  pollIntervalMs: 2000,
  maxConcurrent: 5,
  onError: (error, job) => {
    console.error(`[worker] Job error:`, error, job?.id);
  },
  onJobComplete: (job) => {
    console.log(`[worker] Job completed: ${job.id} (${job.type})`);
  },
});

console.log(`Control-plane running with WebSocket support and job worker`);
