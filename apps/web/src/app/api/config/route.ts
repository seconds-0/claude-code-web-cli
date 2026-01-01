import { NextResponse } from "next/server";

/**
 * API route to expose runtime configuration to client components.
 * This allows env vars to be read at runtime instead of build time.
 */
export async function GET() {
  return NextResponse.json({
    apiUrl:
      process.env["NEXT_PUBLIC_CONTROL_PLANE_URL"] ||
      process.env["CONTROL_PLANE_URL"] ||
      "http://localhost:8080",
  });
}
