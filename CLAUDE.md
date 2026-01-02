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
Control Plane (Railway)
  - Auth (Clerk), REST API, Terminal relay, Preview relay, Voice token minting
        ↓ Public IP (primary) or Tailscale (optional)
User Box (Hetzner)
  - ttyd (0.0.0.0:7681) + tmux, Claude Code CLI, Persistent Volume at /mnt/workspace
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
- **Hosting:** Railway (control plane and web)

### Data Plane (User Compute)

- **Compute:** Hetzner Cloud servers from Packer snapshots
- **Persistence:** Hetzner Volumes (not S3 mounts - object storage is backup only)
- **Terminal:** ttyd with `--writable` and `--url-arg` flags, bound to 0.0.0.0:7681
- **Session Management:** tmux with `pipe-pane` for output capture
- **Networking:** Public IP (primary) for low-latency terminal relay; Tailscale installed for optional private network features

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

- Terminal access (port 7681) relayed through control plane with session token validation
- Control plane validates auth before proxying WebSocket to VM's public IP
- Short-lived session tokens scoped to workspace
- Encrypted stored secrets
- Tailscale available for optional private network features

## Monorepo Structure

```
apps/
  control-plane/     # Hono API + WebSocket gateway
  web/               # Next.js App Router
packages/
  api-contract/      # Zod schemas + OpenAPI generator
  api-client/        # Generated typed client
  db/                # Drizzle schema + migrations
  config/            # Shared TS/ESLint config
box/                 # Per-user machine code (Packer, scripts)
```

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start all apps in dev mode
pnpm build            # Build all packages
pnpm test             # Run full test suite (CI)
pnpm test:core        # Run core tests only (~20, <5s) - pre-commit
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check
pnpm format           # Prettier format
```

## Git & GitHub

- **GitHub account:** Always use the `seconds-0` account for `gh` CLI operations
- **Commit signing:** Skip key signing - use `git commit --no-gpg-sign` or `git -c commit.gpgsign=false commit`

## Testing Strategy

**Tiered approach for fast feedback:**

| Tier        | Location             | When       | Purpose                            |
| ----------- | -------------------- | ---------- | ---------------------------------- |
| Core        | `tests/core/`        | Pre-commit | ~20 critical path tests, <5s total |
| Unit        | `tests/unit/`        | CI         | Full unit coverage                 |
| Integration | `tests/integration/` | CI         | API integration tests              |

**Core tests MUST include:**

- Health endpoint responds
- Auth middleware rejects invalid tokens
- DB connection works
- Critical business logic (1-2 per domain)

## Quality Gates

**Pre-commit (fast):**

- `pnpm lint-staged` - lint changed files
- `pnpm typecheck` - TypeScript
- `pnpm test:core` - core smoke tests

**Post-commit (thorough):**

- `codex exec "Review git diff HEAD~1..."` - deep code review

**CI (comprehensive):**

- Full lint, typecheck, test suite
- Build verification

## Reference Documentation

- [ttyd flags](https://manpages.debian.org/unstable/ttyd/ttyd.1.en.html) - `--writable`, `--url-arg`
- [tmux pipe-pane](https://man7.org/linux/man-pages/man1/tmux.1.html)
- [Deepgram browser WS auth](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol)
- [Tailscale auth keys](https://tailscale.com/kb/1085/auth-keys)
- [Stripe Billing Meters](https://docs.stripe.com/billing/subscriptions/usage-based)
- [Clerk JWT verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- [Hetzner Volumes](https://docs.hetzner.com/cloud/volumes/overview/) - no built-in backups

## Long-Term Planning

See `/TODO.md` for the product roadmap and backlog. Update this file when:

- Starting new work (move to "In Progress")
- Completing work (move to "Done" with date)
- Discovering new requirements (add to "Backlog")

**Competitive baseline:** [Happy Coder](https://github.com/slopus/happy) - our floor for UX simplicity.
