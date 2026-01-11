import { NextResponse } from "next/server";

/**
 * API route to expose runtime configuration to client components.
 * This allows env vars to be read at runtime instead of build time.
 * Also exposes Clerk environment info for debugging auth issues.
 */
export async function GET() {
  const publishableKey = process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] || "";
  const issuerUrl = process.env["CLERK_ISSUER_URL"] || "";
  const secretKeyPrefix = process.env["CLERK_SECRET_KEY"]?.slice(0, 8) || "";

  // Detect if we're using test vs live Clerk credentials
  const clerkMode = publishableKey.startsWith("pk_live_") ? "live" : "test";
  const clerkSecretMode = secretKeyPrefix.startsWith("sk_live") ? "live" : "test";

  // Warn if there's a mismatch
  const clerkConfigValid = clerkMode === clerkSecretMode;

  return NextResponse.json({
    apiUrl:
      process.env["NEXT_PUBLIC_CONTROL_PLANE_URL"] ||
      process.env["CONTROL_PLANE_URL"] ||
      "http://localhost:8080",
    clerk: {
      mode: clerkMode,
      secretMode: clerkSecretMode,
      issuerUrl: issuerUrl || "not set",
      configValid: clerkConfigValid,
      // Don't expose actual keys, just enough to debug
      publishableKeyPrefix: publishableKey.slice(0, 15) + "...",
    },
  });
}
