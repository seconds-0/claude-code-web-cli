# Repository Guidelines

## Project Structure & Module Organization
This repository currently contains planning and agent guidance only:
- `docs/prd.md` — product spec and architecture decisions.
- `CLAUDE.md` — instructions for Claude Code contributions.

If/when code is added, the intended monorepo layout is described in `CLAUDE.md`
(e.g., `apps/`, `packages/`, `box/`). Treat that layout as a roadmap and update
this guide when the real structure diverges.

## Build, Test, and Development Commands
There are no build, test, or runtime commands yet because the repo is
documentation-only. When you add tooling, document the exact commands here (for
example, `pnpm install`, `pnpm dev`, `pnpm test`) and note any required
environment variables.

## Coding Style & Naming Conventions
- Markdown: use short sections, descriptive headings, and bullet lists for
  scannability.
- Files: keep docs in `docs/` with lowercase names (e.g., `docs/prd.md`); root
  docs use uppercase when they are repository-wide policy (`CLAUDE.md`,
  `AGENTS.md`).
- Future code: prefer TypeScript, mirror formatting in adjacent files, and avoid
  introducing a formatter/linter without updating this section.

## Testing Guidelines
No testing framework or coverage targets are defined yet. If you introduce
tests, specify the framework, location (e.g., `apps/*/test`), and naming
convention (e.g., `*.test.ts`) here, and add a command in the previous section.

## Commit & Pull Request Guidelines
This workspace has no Git history, so there is no established commit
convention. Until one emerges, use short, imperative summaries (e.g.,
`docs: clarify backup flow`). PRs should include: a brief purpose, scope, links
to relevant sections in `docs/prd.md`, and any required follow-ups.

## Security & Configuration Tips
Do not commit secrets. If configuration is added, include an `.env.example`,
document required variables, and keep security-sensitive decisions aligned with
`docs/prd.md`.
