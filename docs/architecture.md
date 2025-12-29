# Architecture Overview

## High-level diagram

```
Clients (Web, iOS, Android)
        |
        | HTTPS + WSS (single public entry)
        v
API + Realtime Gateway (Fly.io, multi-region)
  - Auth (Clerk)
  - REST API
  - Terminal relay (WS proxy)
  - Preview relay (HTTP + WS proxy)
  - Voice token minting + optional proxy
        |
        | Private overlay (Tailscale)
        v
User Box (Hetzner)
  - Persistent Volume mounted at /mnt/workspace
  - ttyd bound to private interface
  - tmux session(s)
  - Claude Code CLI
  - Optional: preview helper + process monitor
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
- Terminal: ttyd with --writable and --url-arg flags.
- Session management: tmux with pipe-pane for output capture.
- Networking: Tailscale private overlay (no public box ports).

## Networking and Access Model
- The box has no public inbound exposure; all access goes through the gateway.
- The gateway authenticates users and authorizes session access.
- Gateway-to-box routing uses the box's tailnet IP or stable name.

## Persistence and Backups
- The volume is the live filesystem; object storage is backup/export only.
- Backups are scheduled and encrypted (see engineering spec for details).

## Security Model
- Short-lived session tokens and strict auth on all requests.
- Rate limits on logins and WebSocket creation.
- Audit logging for sensitive actions (SSH key upload, token creation, share links).
