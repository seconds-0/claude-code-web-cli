/**
 * Session Service
 *
 * Manages terminal session tokens for secure WebSocket access.
 * Tokens are short-lived and tied to a specific workspace.
 */

import { randomBytes, createHash } from "crypto";

// Session token TTL (24 hours in seconds)
const SESSION_TOKEN_TTL = 24 * 60 * 60;

// In-memory store for sessions (use Redis in production)
const sessionStore = new Map<
  string,
  {
    workspaceId: string;
    userId: string;
    createdAt: number;
    expiresAt: number;
  }
>();

/**
 * Generate a cryptographically secure session token
 */
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash a token for storage (so raw tokens aren't stored)
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new session token for a workspace
 */
export async function createSessionToken(params: {
  workspaceId: string;
  userId: string;
  ttlSeconds?: number;
}): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const { workspaceId, userId, ttlSeconds = SESSION_TOKEN_TTL } = params;

  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  // Store session
  sessionStore.set(tokenHash, {
    workspaceId,
    userId,
    createdAt: now,
    expiresAt,
  });

  // Schedule cleanup
  setTimeout(() => {
    sessionStore.delete(tokenHash);
  }, ttlSeconds * 1000);

  return {
    token,
    expiresAt: new Date(expiresAt),
  };
}

/**
 * Validate a session token and return the session info
 */
export async function validateSessionToken(token: string): Promise<{
  valid: boolean;
  workspaceId?: string;
  userId?: string;
  error?: string;
}> {
  const tokenHash = hashToken(token);
  const session = sessionStore.get(tokenHash);

  if (!session) {
    return { valid: false, error: "Session not found" };
  }

  if (Date.now() > session.expiresAt) {
    sessionStore.delete(tokenHash);
    return { valid: false, error: "Session expired" };
  }

  return {
    valid: true,
    workspaceId: session.workspaceId,
    userId: session.userId,
  };
}

/**
 * Revoke a session token
 */
export async function revokeSessionToken(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  return sessionStore.delete(tokenHash);
}

/**
 * Get active session count for a user
 */
export function getActiveSessionCount(userId: string): number {
  let count = 0;
  const now = Date.now();

  for (const session of sessionStore.values()) {
    if (session.userId === userId && session.expiresAt > now) {
      count++;
    }
  }

  return count;
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [hash, session] of sessionStore.entries()) {
    if (session.expiresAt < now) {
      sessionStore.delete(hash);
      cleaned++;
    }
  }

  return cleaned;
}
