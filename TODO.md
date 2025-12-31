# Claude Code Cloud - Roadmap

Long-term planning hub. Update when starting/completing work or discovering new requirements.

**Competitive baseline:** [Happy Coder](https://github.com/slopus/happy) (5.9k stars) - our floor for UX simplicity.

---

## In Progress

### Terminal Latency Fix (500ms → <100ms)

**Goal:** Snappy terminal typing experience

#### Phase 1: Local Echo (Immediate)

- [ ] Add `xterm-local-echo` package
- [ ] Integrate local echo addon in `XTerminal.tsx`

#### Phase 2: Direct Connect Mode (Default for new users)

- [ ] Add Caddy reverse proxy to box image (`box/scripts/install-caddy.sh`)
- [ ] Configure JWT validation in Caddyfile
- [ ] New endpoint: `GET /api/v1/workspaces/:id/terminal-url`
- [ ] Frontend: dual-mode connection (direct first, relay fallback)
- [ ] **Default onboarding to direct connect** (best first impression)

#### Phase 3: Private Mode Option

- [ ] Add `privateMode: boolean` to workspace schema (default: false)
- [ ] Add "Private Mode" toggle in workspace settings
- [ ] Warning text: "Adds latency (~300ms) but keeps workspace on private network"
- [ ] When enabled: disable direct connect, use Tailscale relay only

---

## Up Next

### P0: Onboarding UX (THE FLOOR)

**Goal:** < 2 minutes from landing page to terminal (current: 9 steps, ~5+ min)

**Audit completed:** 2024-12-31 (Codex, Gemini, best practices research)

#### Current Flow Problems (9 steps → target 3)

| Step                  | Problem                          | Fix                       |
| --------------------- | -------------------------------- | ------------------------- |
| Empty dashboard       | Dead stop, user must find button | Auto-redirect to setup    |
| Name form             | Non-decision, slows first run    | Default to "My Workspace" |
| Click "Start"         | Manual gate after creation       | Auto-start on create      |
| Wait with no feedback | Silent polling, boring           | Boot sequence animation   |

#### Implementation Tasks

**Backend (control-plane)**

- [ ] Add `autoStart?: boolean` to create workspace API (`packages/api-contract/src/schemas/workspace.ts:50`)
- [ ] Call `startWorkspace()` in POST handler when `autoStart=true` (`apps/control-plane/src/routes/workspaces.ts:80`)
- [ ] (Optional) Add idempotent `/quickstart` endpoint for first-time users

**Frontend (web)**

- [ ] Create `/dashboard/setup` auto-init page that creates+starts workspace automatically
- [ ] Auto-redirect from `/dashboard` when 0 workspaces → `/dashboard/setup`
- [ ] Configure Clerk `afterSignUpUrl="/dashboard/setup"` (`apps/web/src/app/sign-up/[[...sign-up]]/page.tsx:13`)
- [ ] Remove name input from first-run flow (default "My Workspace")
- [ ] Add boot sequence animation during provisioning (replace "AWAITING_CONNECTION")
- [ ] Fix storage mismatch: UI shows 20GB (`new/page.tsx:159`), backend defaults 50GB (`schema.ts:34`)

**UX Polish**

- [ ] Change landing CTA from "Initialize Workspace" to "Start Coding" (expectation match)
- [ ] Auto-redirect to workspace when user has exactly 1 workspace
- [ ] Add progress indicators: "Allocating volume... Starting instance... Connecting..."

**Metrics to Track**

- Time to first terminal (target: < 2 min)
- Onboarding completion rate (target: > 75%)
- Drop-off at each step

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

- [x] Happy Coder competitive analysis (2024-12-31)
- [x] Created roadmap infrastructure (2024-12-31)
- [x] P0 onboarding audit with Codex + Gemini (2024-12-31)

---

## Reference

Full competitive analysis: `~/.claude/plans/dapper-dreaming-corbato.md`
