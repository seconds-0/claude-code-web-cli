/**
 * Shared configuration for the web app
 */

const DEFAULT_API_URL = "http://localhost:8080";

/**
 * Get the control plane API URL.
 * Uses NEXT_PUBLIC_CONTROL_PLANE_URL for client-side,
 * CONTROL_PLANE_URL for server-side, with fallback to localhost.
 */
export function getApiUrl(): string {
  // Client-side env vars must be prefixed with NEXT_PUBLIC_
  if (typeof window !== "undefined") {
    return process.env["NEXT_PUBLIC_CONTROL_PLANE_URL"] || DEFAULT_API_URL;
  }
  // Server-side can use either
  return (
    process.env["CONTROL_PLANE_URL"] ||
    process.env["NEXT_PUBLIC_CONTROL_PLANE_URL"] ||
    DEFAULT_API_URL
  );
}

/**
 * Get the WebSocket URL for terminal connections.
 * Derives from the API URL, converting http(s) to ws(s).
 */
export function getWsUrl(): string {
  const apiUrl = getApiUrl();
  return apiUrl.replace(/^http/, "ws");
}

/**
 * Build the terminal WebSocket URL with session token.
 */
export function getTerminalWsUrl(sessionToken: string): string {
  return `${getWsUrl()}/ws/terminal?token=${encodeURIComponent(sessionToken)}`;
}
