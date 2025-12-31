# Claude Code Cloud - Roadmap

Long-term planning hub. Update when starting/completing work or discovering new requirements.

**Competitive baseline:** [Happy Coder](https://github.com/slopus/happy) (5.9k stars) - our floor for UX simplicity.

---

## In Progress

_Nothing currently in progress_

---

## Up Next

### P1: Mobile Experience + QR Auth

**Goal:** Pair phone in < 30 seconds

- [ ] QR code on web dashboard → opens mobile app
- [ ] Mobile app shows active workspaces immediately
- [ ] Terminal usable on mobile (basic input at minimum)
- [ ] Push notifications when Claude needs attention

### P2: Voice Native

**Goal:** Speak → Claude executes

- [ ] Deepgram WebSocket integration
- [ ] Voice button in terminal UI
- [ ] Voice-to-command transcription
- [ ] Visual feedback during voice capture

### P3: Reliability & Polish

**Goal:** More reliable than Happy Coder (they have sync issues)

- [ ] Terminal reconnection UX (show reconnecting state)
- [ ] Cross-device session continuity
- [ ] Offline action queueing
- [ ] Error states with recovery actions

---

## Backlog

### Features

- [ ] Team collaboration (share workspaces)
- [ ] Preview URLs (expose dev servers without ngrok)
- [ ] Free tier / generous trial
- [ ] Multi-language voice support
- [ ] Custom sign-in UI with "Last used" auth method badge (uses `client.lastAuthenticationStrategy`)

### Technical Debt

- [ ] Audit logging for sensitive actions
- [ ] Rate limiting on login + WebSocket creation

### Marketing / Positioning

- [ ] Lead with "private by default" (Tailscale) in messaging
- [ ] Security as differentiator vs Happy Coder

---

## Done

<!-- Completed items with dates -->

### P0: Onboarding UX (2024-12-31)

**Goal achieved:** Reduced onboarding from 9 steps to 3 steps (commit: 06cfd91)

**Backend:**

- [x] Add `autoStart?: boolean` to create workspace API
- [x] Call `startWorkspace()` automatically when `autoStart=true`
- [x] Default workspace name changed to "My Workspace"

**Frontend:**

- [x] Create `/dashboard/setup` auto-init page with boot sequence animation
- [x] Auto-redirect from `/dashboard` when 0 workspaces
- [x] Configure Clerk `afterSignUpUrl="/dashboard/setup"`
- [x] Fix storage display (20GB → 50GB)
- [x] Change landing CTA to "Start Coding"

**New user flow:** Sign up → Auto-setup with progress animation → Terminal ready

---

### Terminal Latency Fix (2024-12-31)

**Backend:**

- [x] Local echo for immediate latency improvement (commit: 955e936)
- [x] Direct connect infrastructure: Caddy + JWT on VMs (commit: d7a7524)
- [x] Add Caddy reverse proxy to box image (`box/scripts/install-caddy.sh`)
- [x] Configure JWT validation + rate limiting in Caddyfile
- [x] New endpoint: `GET /api/v1/workspaces/:id/direct-connect`
- [x] JWT with IP binding, 5-minute TTL

**Private Mode Option:**

- [x] Add `privateMode: boolean` to workspace schema (default: false) (commit: 3e82a01)
- [x] Add "Private Mode" toggle in workspace settings (`PrivateModeToggle.tsx`)
- [x] Warning text about latency tradeoff
- [x] Direct-connect endpoint respects privateMode setting
- [x] Database migration for privateMode column

**Frontend Integration:**

- [x] Terminal.tsx: Try direct connect first, fall back to relay (commit: 826a797)
- [x] XTerminal.tsx: Accept wsUrl and connectionMode props
- [x] Connection mode badge (green DIRECT / gray RELAY) in terminal header
- [x] Walkthrough documentation updated (commit: 63e5af6)

**Other:**

- [x] Happy Coder competitive analysis (2024-12-31)
- [x] Created roadmap infrastructure (2024-12-31)
- [x] P0 onboarding audit with Codex + Gemini (2024-12-31)
- [x] Onboarding specs updated (NETWORK: DIRECT, LATENCY: ~50MS)
- [x] Fixed storage display (20GB → 50GB)

---

## Reference

Full competitive analysis: `~/.claude/plans/dapper-dreaming-corbato.md`
