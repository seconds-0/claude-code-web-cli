/**
 * Anthropic OAuth Routes
 *
 * Handles Claude Code OAuth token management:
 * - Token capture from VMs after OAuth completion
 * - Token status checking
 * - Token refresh
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { anthropicCredentials, users } from "@ccc/db";
import { authMiddleware } from "../middleware/auth.js";
import {
  encryptTokens,
  decryptTokens,
  validateTokenBlob,
  isTokenExpired,
  isTokenExpiringSoon,
  type TokenBlob,
} from "../services/encryption.js";
import { SignJWT, jwtVerify } from "jose";

type Variables = {
  userId: string;
  dbUserId: string;
};

export const anthropicRoute = new Hono<{ Variables: Variables }>();

// Secret for signing capture tokens
const CAPTURE_TOKEN_SECRET = new TextEncoder().encode(
  process.env["ENCRYPTION_SECRET"] || "dev-secret-change-in-prod"
);

/**
 * Generate a capture token for a workspace
 * This token allows the VM to send captured credentials back to us
 */
export async function generateCaptureToken(userId: string, workspaceId: string): Promise<string> {
  const token = await new SignJWT({ userId, workspaceId, type: "capture" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h") // 1 hour expiry
    .sign(CAPTURE_TOKEN_SECRET);

  return token;
}

/**
 * Verify a capture token
 */
async function verifyCaptureToken(
  token: string
): Promise<{ userId: string; workspaceId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, CAPTURE_TOKEN_SECRET);
    if (payload["type"] !== "capture") {
      return null;
    }
    return {
      userId: payload["userId"] as string,
      workspaceId: payload["workspaceId"] as string,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Public endpoint - Token capture from VM (uses capture token, not Clerk auth)
// ============================================================================

anthropicRoute.post("/capture", async (c) => {
  // Get capture token from Authorization header
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "missing_token", message: "Capture token required" }, 401);
  }

  const captureToken = authHeader.slice(7);
  const tokenData = await verifyCaptureToken(captureToken);

  if (!tokenData) {
    return c.json({ error: "invalid_token", message: "Invalid or expired capture token" }, 401);
  }

  // Parse credentials from body
  let body: { credentials: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_body", message: "Invalid JSON body" }, 400);
  }

  // Validate credentials structure
  // Claude Code stores credentials in this format:
  // { claudeAiOauth: { accessToken, refreshToken, expiresAt, scopes } }
  const claudeCredentials = body.credentials as Record<string, unknown>;
  const oauthData = claudeCredentials?.["claudeAiOauth"] as Record<string, unknown>;

  if (!oauthData) {
    return c.json(
      { error: "invalid_credentials", message: "Missing claudeAiOauth in credentials" },
      400
    );
  }

  const tokenBlob: TokenBlob = {
    accessToken: String(oauthData["accessToken"] || ""),
    refreshToken: String(oauthData["refreshToken"] || ""),
    expiresAt: String(oauthData["expiresAt"] || ""),
    scopes: Array.isArray(oauthData["scopes"]) ? oauthData["scopes"].map(String) : [],
  };

  if (!validateTokenBlob(tokenBlob)) {
    return c.json({ error: "invalid_credentials", message: "Invalid token structure" }, 400);
  }

  // Encrypt and store
  const db = getDb();
  const encrypted = encryptTokens(tokenBlob);
  const expiresAt = new Date(tokenBlob.expiresAt);

  // Upsert credentials
  await db
    .insert(anthropicCredentials)
    .values({
      userId: tokenData.userId,
      encryptedTokens: encrypted.ciphertext,
      encryptionIv: encrypted.iv,
      expiresAt,
      status: "valid",
    })
    .onConflictDoUpdate({
      target: anthropicCredentials.userId,
      set: {
        encryptedTokens: encrypted.ciphertext,
        encryptionIv: encrypted.iv,
        expiresAt,
        status: "valid",
        updatedAt: new Date(),
      },
    });

  console.log(`[anthropic] Captured tokens for user ${tokenData.userId}`);

  return c.json({ success: true, message: "Tokens captured successfully" }, 201);
});

// ============================================================================
// Authenticated endpoints (require Clerk auth)
// ============================================================================

// Apply auth middleware to remaining routes
anthropicRoute.use("/status", authMiddleware);
anthropicRoute.use("/disconnect", authMiddleware);
anthropicRoute.use("/tokens", authMiddleware);

// Middleware to resolve Clerk userId to database userId
const resolveUser = async (
  c: {
    get: (key: string) => string;
    set: (key: string, value: string) => void;
    json: (data: unknown, status?: number) => Response;
  },
  next: () => Promise<void>
) => {
  const clerkId = c.get("userId");
  const db = getDb();

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!user) {
    return c.json({ error: "user_not_found", message: "User not found" }, 404);
  }

  c.set("dbUserId", user.id);
  return next();
};

anthropicRoute.use("/status", resolveUser);
anthropicRoute.use("/disconnect", resolveUser);
anthropicRoute.use("/tokens", resolveUser);

// GET /api/v1/anthropic/status - Check if user has connected Anthropic
anthropicRoute.get("/status", async (c) => {
  const dbUserId = c.get("dbUserId");
  const db = getDb();

  const creds = await db.query.anthropicCredentials.findFirst({
    where: eq(anthropicCredentials.userId, dbUserId),
  });

  if (!creds) {
    return c.json({
      connected: false,
      status: "not_connected",
    });
  }

  // Check token status
  let status = creds.status;
  if (creds.expiresAt && new Date(creds.expiresAt) < new Date()) {
    status = "expired";
  }

  // Decrypt to check expiring soon
  let expiringSoon = false;
  try {
    const tokens = decryptTokens({
      ciphertext: creds.encryptedTokens,
      iv: creds.encryptionIv,
    });
    expiringSoon = isTokenExpiringSoon(tokens);
  } catch {
    status = "error";
  }

  return c.json({
    connected: status === "valid",
    status,
    expiresAt: creds.expiresAt?.toISOString(),
    expiringSoon,
    updatedAt: creds.updatedAt.toISOString(),
  });
});

// DELETE /api/v1/anthropic/disconnect - Remove stored credentials
anthropicRoute.delete("/disconnect", async (c) => {
  const dbUserId = c.get("dbUserId");
  const db = getDb();

  await db.delete(anthropicCredentials).where(eq(anthropicCredentials.userId, dbUserId));

  console.log(`[anthropic] Disconnected credentials for user ${dbUserId}`);

  return c.json({ success: true, message: "Anthropic account disconnected" });
});

// GET /api/v1/anthropic/tokens - Get decrypted tokens (internal use for provisioning)
// This endpoint should be protected and only used by internal services
anthropicRoute.get("/tokens", async (c) => {
  const dbUserId = c.get("dbUserId");
  const db = getDb();

  const creds = await db.query.anthropicCredentials.findFirst({
    where: eq(anthropicCredentials.userId, dbUserId),
  });

  if (!creds) {
    return c.json({ error: "not_connected", message: "Anthropic not connected" }, 404);
  }

  try {
    const tokens = decryptTokens({
      ciphertext: creds.encryptedTokens,
      iv: creds.encryptionIv,
    });

    if (isTokenExpired(tokens)) {
      return c.json({ error: "expired", message: "Tokens have expired" }, 401);
    }

    return c.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    });
  } catch (error) {
    console.error("[anthropic] Failed to decrypt tokens:", error);
    return c.json({ error: "decrypt_failed", message: "Failed to decrypt tokens" }, 500);
  }
});

/**
 * Get tokens for a user by their database ID (for internal provisioning use)
 */
export async function getTokensForUser(userId: string): Promise<TokenBlob | null> {
  const db = getDb();

  const creds = await db.query.anthropicCredentials.findFirst({
    where: eq(anthropicCredentials.userId, userId),
  });

  if (!creds) {
    return null;
  }

  try {
    const tokens = decryptTokens({
      ciphertext: creds.encryptedTokens,
      iv: creds.encryptionIv,
    });

    if (isTokenExpired(tokens)) {
      return null;
    }

    return tokens;
  } catch {
    return null;
  }
}
