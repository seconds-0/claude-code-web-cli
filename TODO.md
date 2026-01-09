# Claude Code Cloud - Roadmap

Long-term planning hub. Update when starting/completing work or discovering new requirements.

**Competitive baseline:** [Happy Coder](https://github.com/slopus/happy) (5.9k stars) - our floor for UX simplicity.

---

## In Progress

### Billing System Setup (PR #10 merged, needs activation)

**Goal:** Enable Stripe subscriptions and usage-based billing

Code is complete and tested (~133 tests). Needs external service configuration to activate.

#### Step 1: Stripe Account Setup

- [ ] Create Stripe account (or switch from test to live mode)
- [ ] Set `STRIPE_SECRET_KEY` environment variable
- [ ] Run setup script to create products/prices/meters:
  ```bash
  cd apps/control-plane
  STRIPE_SECRET_KEY=sk_xxx pnpm tsx src/scripts/stripe-setup.ts
  ```
- [ ] Copy output IDs to environment variables:
  - `STRIPE_PRODUCT_STARTER`, `STRIPE_PRODUCT_PRO`, `STRIPE_PRODUCT_UNLIMITED`
  - `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_UNLIMITED`
  - `STRIPE_METER_COMPUTE`, `STRIPE_METER_STORAGE`, `STRIPE_METER_VOICE`

#### Step 2: Stripe Webhook Configuration

- [ ] Go to Stripe Dashboard → Developers → Webhooks
- [ ] Add endpoint: `https://api.untethered.computer/webhooks/stripe`
- [ ] Select events:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.subscription.trial_will_end`
- [ ] Copy signing secret to `STRIPE_WEBHOOK_SECRET`

#### Step 3: QStash Setup (Upstash)

- [ ] Create Upstash account at https://upstash.com
- [ ] Create QStash instance
- [ ] Copy credentials:
  - `QSTASH_TOKEN` (for setup script)
  - `QSTASH_CURRENT_SIGNING_KEY` (for signature verification)
  - `QSTASH_NEXT_SIGNING_KEY` (for key rotation)
- [ ] Run setup script to create scheduled jobs:
  ```bash
  cd apps/control-plane
  QSTASH_TOKEN=xxx API_URL=https://api.untethered.computer pnpm tsx src/scripts/qstash-setup.ts
  ```

#### Step 4: Railway Environment Variables

Add all variables to Railway control-plane service:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRODUCT_STARTER=prod_xxx
STRIPE_PRODUCT_PRO=prod_xxx
STRIPE_PRODUCT_UNLIMITED=prod_xxx
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_UNLIMITED=price_xxx
STRIPE_METER_COMPUTE=mtr_xxx
STRIPE_METER_STORAGE=mtr_xxx
STRIPE_METER_VOICE=mtr_xxx

# QStash
QSTASH_CURRENT_SIGNING_KEY=sig_xxx
QSTASH_NEXT_SIGNING_KEY=sig_xxx
```

#### Step 5: Verification

- [ ] Deploy control-plane with new env vars
- [ ] Check `/jobs/health` returns `qstashConfigured: true`
- [ ] Check `/webhooks/stripe/health` returns `stripeConfigured: true`
- [ ] Test checkout flow with Stripe test card (4242 4242 4242 4242)
- [ ] Verify webhook events are received (check Stripe Dashboard → Webhooks → Logs)
- [ ] Verify QStash jobs are running (check Upstash Dashboard → QStash → Schedules)

#### Billing Features Included

| Feature                                       | Status        |
| --------------------------------------------- | ------------- |
| Free tier (30 compute min, 10GB storage)      | ✅ Code ready |
| Starter tier ($9/mo, 1800 min, 25GB)          | ✅ Code ready |
| Pro tier ($19/mo, unlimited compute, 100GB)   | ✅ Code ready |
| Unlimited tier ($49/mo, everything unlimited) | ✅ Code ready |
| Usage alerts (50%, 80%, 100%)                 | ✅ Code ready |
| Overage billing                               | ✅ Code ready |
| Stripe Customer Portal                        | ✅ Code ready |
| Webhook idempotency                           | ✅ Code ready |

---

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

- [ ] **Compare Deepgram vs Parakeet** - test accuracy on coding/terminal commands (18% vs 6% WER claimed, but Deepgram is 14x cheaper: $0.36 vs $5 per 1K requests)
- [ ] Voice button in terminal UI
- [ ] Voice-to-command transcription (winner of comparison above)
- [ ] Visual feedback during voice capture

#### NVIDIA Parakeet Research (2026-01-09)

**Key finding:** NVIDIA's Parakeet models are open-source, self-hostable, and outperform most alternatives.

| Model        | Parakeet-TDT-v2 | Deepgram Nova-3 | OpenAI Whisper |
| ------------ | --------------- | --------------- | -------------- |
| WER (clean)  | **6.05%**       | ~18%            | ~6-8%          |
| Speed (RTFx) | **3,380**       | Sub-300ms       | ~0.1-0.5       |
| License      | CC-BY-4.0       | Proprietary     | MIT            |
| Self-host    | ✅              | ❌              | ✅             |

**Recommendation:**

- **Real-time streaming:** Keep Deepgram API (optimized for <300ms latency)
- **Batch/accuracy:** Self-host Parakeet (50x faster than Whisper, better WER)
- **Multi-language:** Parakeet v3 supports 25 European languages with auto-detection

**Requirements:** NVIDIA GPU (A100/T4/V100), NeMo framework, 16kHz mono audio

**Spokenly** ([spokenly.app](https://spokenly.app/)): macOS/iPhone dictation app using Parakeet & Whisper locally. Free for local models, $7.99/mo for cloud features. Good reference for UX patterns (100+ languages, Agent Mode for voice commands, real-time transcription).

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
