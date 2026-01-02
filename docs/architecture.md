# Architecture Overview

## High-level diagram

```
Clients (Web, iOS, Android)
        |
        | HTTPS + WSS (single public entry)
        v
Control Plane (Railway)
  - Auth (Clerk)
  - REST API
  - Terminal relay (WS proxy)
  - Preview relay (HTTP + WS proxy)
  - Voice token minting + optional proxy
        |
        | Public IP (primary) or Tailscale (optional)
        v
User Box (Hetzner)
  - Persistent Volume mounted at /mnt/workspace
  - ttyd bound to 0.0.0.0:7681
  - tmux session(s)
  - Claude Code CLI
  - Tailscale (optional, for private network features)
        |
        v
Backup/Export (R2 via S3 API tokens)
```

## Control Plane

- Runtime: Node.js + TypeScript.
- HTTP framework: Hono (REST endpoints and middleware).
- Database: Postgres (Neon).
- Cache and locks: Upstash Redis.
- ORM and migrations: Drizzle ORM + drizzle-kit.
- Auth: Clerk (JWT verification via backend/JWKS).
- Billing: Stripe subscriptions + Billing Meters.
- Hosting: Fly.io (gateway) and Vercel (web).

## Data Plane (User Compute)

- Compute: Hetzner Cloud servers created from a baked snapshot.
- Persistence: Hetzner Volume per workspace (POSIX semantics).
- Terminal: ttyd with --writable and --url-arg flags, bound to 0.0.0.0:7681.
- Session management: tmux with pipe-pane for output capture.
- Networking: Public IP for low-latency terminal relay; Tailscale installed for optional private features.

## Networking and Access Model

- Terminal access (ttyd port 7681) is relayed through the control plane.
- Control plane validates session tokens before proxying WebSocket connections.
- Gateway-to-box routing uses the box's public IP (stored in `workspace_instances.publicIp`).
- Tailscale available as optional fallback via `workspace_instances.tailscaleIp`.

## Persistence and Backups

- The volume is the live filesystem; object storage is backup/export only.
- Backups are scheduled and encrypted (see engineering spec for details).

## Security Model

- Short-lived session tokens scoped to workspace.
- Control plane validates auth before proxying to VM's public IP.
- Rate limits on logins and WebSocket creation.
- Audit logging for sensitive actions (SSH key upload, token creation, share links).
- VM's public IP not exposed to clients (only control plane knows it).
