# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Cloud - a cloud development environment service with real terminal access, persistent filesystems, and voice-first interaction. Two relationship modes:
- **Guided mode:** Claude drives decisions; user provides intent
- **Engineer mode:** User drives; Claude assists; terminal-first

## Architecture

```
Clients (Web, iOS, Android)
        ↓ HTTPS + WSS
API + Realtime Gateway (Fly.io)
  - Auth (Clerk), REST API, Terminal relay, Preview relay, Voice token minting
        ↓ Private overlay (Tailscale)
User Box (Hetzner)
  - ttyd + tmux, Claude Code CLI, Persistent Volume at /mnt/workspace
        ↓
Backup/Export (Cloudflare R2)
```

## Tech Stack

### Control Plane
- **Runtime:** Node.js + TypeScript
- **Framework:** Hono (REST + WebSocket)
- **Database:** Postgres (Neon) with Drizzle ORM
- **Cache/Locks:** Upstash Redis
- **Auth:** Clerk (JWT/JWKS verification)
- **Billing:** Stripe subscriptions + Billing Meters
- **Hosting:** Fly.io (gateway), Vercel (web)

### Data Plane (User Compute)
- **Compute:** Hetzner Cloud servers from Packer snapshots
- **Persistence:** Hetzner Volumes (not S3 mounts - object storage is backup only)
- **Terminal:** ttyd with `--writable` and `--url-arg` flags
- **Session Management:** tmux with `pipe-pane` for output capture
- **Networking:** Tailscale private overlay (no public box ports)

### Clients
- **Web:** Next.js App Router
- **Mobile:** Expo (note: use `expo-audio`, NOT deprecated `expo-av`)

## Key Implementation Details

### Terminal Notifications
Use `tmux pipe-pane` to capture pane output - do NOT rely on tmux `history-file` which doesn't produce scrollback files by default.

### Voice Integration
- **Web:** Direct Deepgram WebSocket using `Sec-WebSocket-Protocol` header for auth
- **Mobile:** Real streaming capture, not deprecated expo-av

### Persistence Tiers
- **Suspend tier:** Files persist, processes do not
- **Always-on tier:** VM stays running, tmux and background tasks persist

### Security Model
- Boxes have no public inbound exposure
- All access through gateway over Tailscale
- Short-lived session tokens
- Encrypted stored secrets

## Monorepo Structure (Planned)

```
apps/
  control-plane/     # Hono API + WebSocket gateway
  web/               # Next.js App Router
  mobile/            # Expo app (placeholder)
packages/
  api-contract/      # Zod schemas + OpenAPI generator
  api-client/        # Generated typed client
  config/            # Shared TS/ESLint config
box/                 # Per-user machine code (ttyd/tmux/agent)
```

## Reference Documentation

- [ttyd flags](https://manpages.debian.org/unstable/ttyd/ttyd.1.en.html) - `--writable`, `--url-arg`
- [tmux pipe-pane](https://man7.org/linux/man-pages/man1/tmux.1.html)
- [Deepgram browser WS auth](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol)
- [Tailscale auth keys](https://tailscale.com/kb/1085/auth-keys)
- [Stripe Billing Meters](https://docs.stripe.com/billing/subscriptions/usage-based)
- [Clerk JWT verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- [Hetzner Volumes](https://docs.hetzner.com/cloud/volumes/overview/) - no built-in backups
