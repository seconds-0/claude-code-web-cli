# Claude Code Cloud - Product Requirements

**Tagline:** Your cloud dev machine with Claude Code, accessible anywhere. Real terminal, real filesystem, real persistence. Voice-first. Works from any device.
**Version:** 2.0
**Last Updated:** 2025-12-28

## Summary
Claude Code Cloud provides a real cloud dev machine with Claude Code, accessible from web and mobile. Users get a real terminal, real filesystem, and persistence, with voice-first interaction as a first-class path.

## Goals
- Provide a secure, private dev environment with real shell access.
- Support two relationship modes: Guided and Engineer.
- Deliver persistent projects with clear expectations about process persistence.
- Enable authenticated previews for local dev servers.
- Enable voice input across web and mobile clients.

## User Modes
- Guided mode: Claude drives decisions; user provides intent.
- Engineer mode: user drives; Claude assists; terminal-first.

## Core Decisions
- Persistence tiers: Suspend (files persist, processes do not) and Always-on (VM stays running).
- Primary storage is a Hetzner Volume; Cloudflare R2 is for backups and export only.
- Terminal ports are never public; access is via a gateway over a private overlay (Tailscale).
- Billing uses Stripe Billing Meters, not legacy usage records.
- Mobile voice streaming uses a dedicated streaming capture method; do not rely on deprecated expo-av.

## Assumptions to Validate
- Claude Code CLI provides a stable entrypoint and supported env var for Anthropic credentials.
- Hetzner servers can be created without public networking while still allowing outbound access.

## MVP Scope (Phase 1)
- Provision a workspace VM from a Packer snapshot and attach a volume.
- Join Tailscale and expose ttyd only on the private network.
- Map DB sessions to tmux sessions and relay terminal IO through the gateway.
- Capture terminal output via tmux pipe-pane for notifications.

## Supporting Docs
- Architecture overview: `docs/architecture.md`
- Engineering specification: `docs/engineering-spec.md`
- Reference links: `docs/references.md`
