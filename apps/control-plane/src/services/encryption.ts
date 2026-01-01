/**
 * Encryption Service for Anthropic OAuth Tokens
 *
 * Uses AES-256-GCM for authenticated encryption of OAuth tokens.
 * Key is derived from ENCRYPTION_SECRET env var using PBKDF2.
 */

import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from "crypto";

// Token structure stored in encrypted form
export interface TokenBlob {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO timestamp
  scopes: string[];
}

// Result of encryption
export interface EncryptedData {
  ciphertext: string; // Base64 encoded
  iv: string; // Base64 encoded
}

// Constants
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT = "claude-code-cloud-v1"; // Static salt - key uniqueness comes from secret
const ITERATIONS = 100000; // PBKDF2 iterations

// Cached derived key (derived once per process)
let derivedKey: Buffer | null = null;

/**
 * Get or derive the encryption key from ENCRYPTION_SECRET
 */
function getKey(): Buffer {
  if (derivedKey) {
    return derivedKey;
  }

  const secret = process.env["ENCRYPTION_SECRET"];
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET environment variable is required");
  }

  if (secret.length < 32) {
    throw new Error("ENCRYPTION_SECRET must be at least 32 characters");
  }

  // Derive key using PBKDF2
  derivedKey = pbkdf2Sync(secret, SALT, ITERATIONS, KEY_LENGTH, "sha256");
  return derivedKey;
}

/**
 * Encrypt a token blob
 */
export function encryptTokens(tokens: TokenBlob): EncryptedData {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const plaintext = JSON.stringify(tokens);
  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");

  // Append auth tag to ciphertext
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([Buffer.from(ciphertext, "base64"), authTag]);

  return {
    ciphertext: combined.toString("base64"),
    iv: iv.toString("base64"),
  };
}

/**
 * Decrypt a token blob
 */
export function decryptTokens(encrypted: EncryptedData): TokenBlob {
  const key = getKey();
  const iv = Buffer.from(encrypted.iv, "base64");
  const combined = Buffer.from(encrypted.ciphertext, "base64");

  // Split ciphertext and auth tag
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);

  return JSON.parse(plaintext.toString("utf8")) as TokenBlob;
}

/**
 * Validate that a token blob has the expected structure
 */
export function validateTokenBlob(data: unknown): data is TokenBlob {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  return (
    typeof obj["accessToken"] === "string" &&
    typeof obj["refreshToken"] === "string" &&
    typeof obj["expiresAt"] === "string" &&
    Array.isArray(obj["scopes"]) &&
    (obj["scopes"] as unknown[]).every((s) => typeof s === "string")
  );
}

/**
 * Check if tokens are expired or expiring soon
 */
export function isTokenExpiringSoon(tokens: TokenBlob, thresholdMs = 2 * 60 * 60 * 1000): boolean {
  const expiresAt = new Date(tokens.expiresAt).getTime();
  const now = Date.now();
  return expiresAt - now < thresholdMs;
}

/**
 * Check if tokens are already expired
 */
export function isTokenExpired(tokens: TokenBlob): boolean {
  const expiresAt = new Date(tokens.expiresAt).getTime();
  return Date.now() > expiresAt;
}
