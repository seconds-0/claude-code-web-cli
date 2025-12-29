import type { Context, Next } from "hono";

/**
 * Auth middleware that validates Bearer tokens.
 * In production, this verifies JWT with Clerk JWKS.
 * For testing, can be mocked via SKIP_AUTH env var.
 */
export async function authMiddleware(c: Context, next: Next) {
  // Skip auth in test mode when explicitly disabled
  if (process.env["SKIP_AUTH"] === "true") {
    c.set("userId", "test-user-id");
    return next();
  }

  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json({ error: "unauthorized", message: "Missing Authorization header" }, 401);
  }

  if (!authHeader.startsWith("Bearer ")) {
    return c.json({ error: "unauthorized", message: "Invalid Authorization format" }, 401);
  }

  const token = authHeader.slice(7);

  if (!token) {
    return c.json({ error: "unauthorized", message: "Missing token" }, 401);
  }

  // TODO: In production, verify JWT with Clerk JWKS
  // For now, just check token is present (will be replaced with real validation)
  // This allows tests to pass a dummy token

  // Set user context for downstream handlers
  c.set("userId", "placeholder-user-id");

  return next();
}
