# Repository Guidelines

## Project Structure & Module Organization

pnpm monorepo with Turborepo orchestration:

```
apps/
  control-plane/     # Hono API + WebSocket gateway (Node.js)
  web/               # Next.js App Router
packages/
  api-contract/      # Zod schemas + OpenAPI generator (@hono/zod-openapi)
  api-client/        # Generated typed client (openapi-typescript + openapi-fetch)
  db/                # Drizzle ORM schema + migrations
  config/            # Shared TypeScript + ESLint configs
box/                 # Packer templates + box-agent scripts
docs/                # PRD, architecture, engineering spec
```

## Build, Test, and Development Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start all apps in dev mode (turbo dev)
pnpm build            # Build all packages (turbo build)
pnpm test             # Run full test suite
pnpm test:core        # Run core tests only (~20 tests, <5s) - for pre-commit
pnpm lint             # ESLint across all packages
pnpm typecheck        # TypeScript strict mode check
pnpm format           # Prettier format all files
pnpm format:check     # Check formatting without writing
```

**Environment variables:** See `.env.example` for required vars (DATABASE_URL, CLERK_*, etc.)

## Testing Guidelines

**Framework:** Vitest (fast, TypeScript-native)

**Tiered strategy:**
| Tier | Location | Trigger | Budget |
|------|----------|---------|--------|
| Core | `tests/core/*.test.ts` | Pre-commit | ~20 tests, <5s |
| Unit | `tests/unit/*.test.ts` | CI | Full coverage |
| Integration | `tests/integration/*.test.ts` | CI | API tests |

**Test file naming:** `*.test.ts` colocated with source or in `tests/` directories

**Coverage target:** 80% for packages, enforced in CI

**Core tests MUST cover:**
1. Health endpoint responds 200
2. Auth rejects invalid tokens (401)
3. Auth rejects wrong user access (403)
4. DB connection works
5. Critical business logic (1-2 per domain entity)

## Coding Style & Naming Conventions

**TypeScript:** Strict mode enabled. Use path aliases (`@/`, `@db/`, etc.)

**Formatting:** Prettier with default config. Run `pnpm format` before commit.

**Linting:** ESLint with TypeScript rules. Shared config in `packages/config/`.

**File naming:**
- Source: `kebab-case.ts` (e.g., `auth-middleware.ts`)
- Tests: `*.test.ts`
- React components: `PascalCase.tsx`
- Docs: lowercase in `docs/` (e.g., `docs/prd.md`)
- Root policies: UPPERCASE (`CLAUDE.md`, `AGENTS.md`)

**Hono route pattern:**
```typescript
app.get('/api/v1/resource', authMiddleware, async (c) => {
  const user = c.get('user');
  const data = await db.select().from(table).where(eq(table.userId, user.id));
  return c.json({ data });
});
```

**Drizzle schema pattern:**
```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').unique().notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

## Commit & Pull Request Guidelines

**Atomic commits:** Each commit = ONE coherent change. If the message needs "and", split it.

**Message format:** Imperative, lowercase category prefix:
- `feat: add workspace creation endpoint`
- `fix: handle null user in auth middleware`
- `docs: clarify backup flow`
- `test: add core tests for session lifecycle`
- `refactor: extract auth logic to middleware`

**PR requirements:**
- Brief purpose and scope
- Link to relevant `docs/` sections
- All checks passing (lint, typecheck, test)
- Codex review completed for non-trivial changes

## Quality Gates

**Pre-commit (automatic via Husky):**
```bash
pnpm lint-staged     # Lint + format staged files
pnpm typecheck       # Full TypeScript check
pnpm test:core       # Core smoke tests
```

**Post-commit (manual, for meaningful changes):**
```bash
codex exec "Review git diff HEAD~1. Focus on bugs, security, architecture. Be specific with file:line."
```

**CI (GitHub Actions):**
- Full lint, typecheck, test suite
- Build verification
- Coverage check (≥80%)

## Security & Configuration

**Secrets:** Never commit. Use `.env.example` as template.

**Required env vars:**
- `DATABASE_URL` - Postgres connection (Neon)
- `CLERK_SECRET_KEY` - Clerk backend auth
- `CLERK_PUBLISHABLE_KEY` - Clerk frontend
- `UPSTASH_REDIS_URL` - Redis for cache/locks
- `STRIPE_SECRET_KEY` - Billing (when needed)

**Security baseline:**
- All endpoints require auth except `/health`
- Validate ownership before resource access
- Rate limit auth endpoints
- Encrypt secrets at rest
