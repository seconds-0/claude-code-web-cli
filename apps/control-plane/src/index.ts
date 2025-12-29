import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = parseInt(process.env["PORT"] || "8080", 10);

console.log(`Starting control-plane on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
