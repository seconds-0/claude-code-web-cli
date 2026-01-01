/**
 * Shared configuration for the web app
 */

const DEFAULT_API_URL = "http://localhost:8080";

// Cache for runtime config (client-side)
let cachedApiUrl: string | null = null;

/**
 * Get the control plane API URL.
 * Server-side: reads from env vars directly
 * Client-side: uses cached value from fetchRuntimeConfig()
 */
export function getApiUrl(): string {
  // Server-side can read env vars directly
  if (typeof window === "undefined") {
    return (
      process.env["CONTROL_PLANE_URL"] ||
      process.env["NEXT_PUBLIC_CONTROL_PLANE_URL"] ||
      DEFAULT_API_URL
    );
  }
  // Client-side: use cached value or fallback
  // The cached value is set by fetchRuntimeConfig() which should be called on app init
  return cachedApiUrl || process.env["NEXT_PUBLIC_CONTROL_PLANE_URL"] || DEFAULT_API_URL;
}

/**
 * Fetch runtime config from the server.
 * Call this once on app initialization for client components.
 */
export async function fetchRuntimeConfig(): Promise<{ apiUrl: string }> {
  if (typeof window === "undefined") {
    // Server-side: return env vars directly
    return { apiUrl: getApiUrl() };
  }

  // Client-side: fetch from API route
  if (cachedApiUrl) {
    return { apiUrl: cachedApiUrl };
  }

  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    cachedApiUrl = config.apiUrl;
    return config;
  } catch {
    return { apiUrl: DEFAULT_API_URL };
  }
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
