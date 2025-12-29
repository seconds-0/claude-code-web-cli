import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Cache the JWKS for Clerk
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const issuer = process.env["CLERK_ISSUER_URL"];
    if (!issuer) {
      throw new Error("CLERK_ISSUER_URL environment variable is required");
    }
    // Clerk's JWKS endpoint
    const jwksUrl = new URL("/.well-known/jwks.json", issuer);
    jwks = createRemoteJWKSet(jwksUrl);
  }
  return jwks;
}

interface ClerkJwtPayload {
  sub: string; // Clerk user ID
  iss: string; // Issuer
  aud: string; // Audience (optional)
  exp: number; // Expiration
  iat: number; // Issued at
  nbf: number; // Not before
  azp?: string; // Authorized party (client ID)
}

/**
 * Auth middleware that validates Bearer tokens.
 * Verifies JWT with Clerk JWKS.
 * For testing, can be mocked via SKIP_AUTH env var.
 */
export async function authMiddleware(c: Context, next: Next) {
  // Skip auth in test mode when explicitly disabled
  if (process.env["SKIP_AUTH"] === "true") {
    // Allow tests to pass a user ID via header
    const testUserId = c.req.header("X-Test-User-Id") || "test-user-id";
    c.set("userId", testUserId);
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

  try {
    const jwksSet = getJwks();
    const issuer = process.env["CLERK_ISSUER_URL"];

    const { payload } = await jwtVerify(token, jwksSet, {
      issuer,
      // Clerk tokens don't always have audience, so we don't verify it
    });

    const clerkPayload = payload as unknown as ClerkJwtPayload;

    if (!clerkPayload.sub) {
      return c.json({ error: "unauthorized", message: "Invalid token: missing subject" }, 401);
    }

    // Set user context for downstream handlers
    c.set("userId", clerkPayload.sub);

    return next();
  } catch (error) {
    console.error("JWT verification failed:", error);

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes("expired")) {
        return c.json({ error: "unauthorized", message: "Token expired" }, 401);
      }
      if (error.message.includes("signature")) {
        return c.json({ error: "unauthorized", message: "Invalid token signature" }, 401);
      }
    }

    return c.json({ error: "unauthorized", message: "Invalid token" }, 401);
  }
}
