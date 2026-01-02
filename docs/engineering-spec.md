# Engineering Specification

## Box Image and Provisioning

- Use Packer to build the Hetzner snapshot.
- Do not bake secrets into the image; inject at provision time.
- Box agent responsibilities:
  - Mount the volume and enforce the workspace layout.
  - Start ttyd and bootstrap tmux sessions.
  - Join Tailscale.
  - Emit telemetry and notification events.
- If using systemd, do not rely on /etc/environment for service envs.

## Workspace Layout

Volume mounted at /mnt/workspace:

```
/mnt/workspace/
  user/
    home/       (bind mount or symlink to /home/claude)
    projects/
    .ssh/
    .claude/
  system/
    logs/
    backups/
    state/
```

- Do not mount object storage as a live filesystem.
- Do not mount Git repos directly on S3 via s3fs; it is not a POSIX-safe path.

## Backups

- Use restic to back up the volume to R2 (encrypted).
- Backup triggers:
  - Nightly scheduled backup.
  - Pre-suspend backup (best effort).
  - Manual export.
- R2 IAM changes can take about a minute to apply; add retry/backoff.

## Networking and Access

- On provision: Store VM's public IP in `workspace_instances.publicIp`.
- Tailscale: `tailscale up --auth-key=...` for optional private network features.
- Control plane proxies via public IP (primary) or Tailscale IP (fallback):
  - Terminal WebSocket.
  - Preview HTTP/WebSocket.
  - Health checks.
- No direct client-to-box networking; control plane validates session tokens before proxying.

## Terminal Stack (ttyd + tmux)

- ttyd flags: --writable and --url-arg; bind to 0.0.0.0:7681 (all interfaces).
- Control plane relays WebSocket connections with session token validation.
- One tmux session per Session record.
- Suggested layout:
  - Pane 1: Claude Code.
  - Pane 2: logs/preview commands.
  - Pane 3: shell.
- Use tmux pipe-pane to capture output for notifications; do not rely on history-file.

## Preview System

- Gateway route: GET /api/v1/previews/:previewId/\* -> boxTailIP:port.
- Support WebSocket upgrades for HMR and dev servers.
- Store routing metadata in DB/Redis to survive Fly.io reconnections.

## Voice Integration

- Web: client connects directly to Deepgram using Sec-WebSocket-Protocol token.
- Mobile: use dedicated streaming capture (native module or gateway proxy).
- expo-av is deprecated; do not rely on it for production streaming.
- Route transcripts to the active interaction target (tmux or task instruction).

## Auth and Authorization

- Use Clerk JWKS verification (backend flow) rather than shared JWT secrets.
- Every request resolves user identity, workspace ownership, and session ownership.

## Billing and Metering

- Use Stripe Billing Meters.
- Emit compute_minute events with idempotency keys:
  - (workspaceInstanceId, minuteTimestamp).

## Data Model

- users
- workspaces (1:1 with user initially)
- workspace_volumes
- workspace_instances
- sessions
- previews
- notifications
- meter_events (internal, idempotent)
- voice_usage (optional)

## Background Jobs

- Do not run cron in every API replica without leader election.
- Use a single-region worker, Postgres advisory locks, or a queue with exactly-once semantics.

## Observability

- Structured JSON logs and per-request tracing IDs.
- Box-agent logs shipped to a central store.
- Metrics:
  - time-to-ready
  - reconnection rate
  - terminal latency
  - hibernate/wake failures
  - backup success/failure

## Security Baseline

- Terminal port (7681) accessible only via control plane relay with session token validation.
- VM's public IP not exposed to clients.
- Short-lived session tokens scoped to workspace.
- Rate-limit logins and WebSocket creation.
- Encrypt stored secrets.
- Audit log for sensitive actions.

## Implementation Phases

### Phase 1 - Minimal lovable core (Engineer mode)

1. Provision workspace VM from Packer snapshot.
2. Attach and mount volume; create user and directory structure.
3. Join Tailscale; gateway can reach the box privately.
4. Start ttyd with --writable and --url-arg.
5. Gateway proxies WebSocket terminal IO.
6. Session creation maps DB session -> tmux session name.
7. Fix notification pipeline using tmux pipe-pane.

### Phase 2 - Preview URLs

1. Record preview targets (port + command heuristics).
2. Reverse proxy HTTP + WS through gateway to box.

### Phase 3 - Guided mode + onboarding

1. Interview flow generates CLAUDE.md files.
2. Guided sessions launch Claude Code automatically in tmux.

### Phase 4 - Voice

1. Web: direct Deepgram streaming using token subprotocol.
2. Mobile: implement real streaming capture using a supported approach.

### Phase 5 - Billing meters

1. Track runtime and send meter events.
2. Enforce quotas and overage rules.

## Repo Bootstrap Tasks

- Add real /api/v1 routes to apps/control-plane/src/app.ts and move demo routes into src/routes/.
- Add auth middleware using Clerk (backend authenticateRequest or JWKS verification).
- Add Drizzle schema + migrations; wire DATABASE_URL into the control-plane.
- Add WebSocket gateway endpoints in apps/control-plane/src/ws/.
- Decide persistence mechanism for workspaces and implement it under box/.
