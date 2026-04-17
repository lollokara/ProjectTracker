# AGENTS.md — Project Tracker

## Repository Overview

Single-user, self-hosted project tracking app. pnpm workspace monorepo.

### Structure
- `apps/web` — Next.js 15 web app (App Router, Tailwind CSS 4, iron-session)
- `apps/worker` — Node.js reminder dispatcher (polls DB, sends Web Push)
- `packages/db` — Drizzle ORM schema, migrations, bootstrap/seed scripts
- `packages/shared` — Zod validation schemas and TypeScript types
- `infra/docker` — Docker Compose, Dockerfiles
- `docs/` — Deployment documentation
- `scripts/` — Utility scripts (VAPID key generation)

### Key Decisions
- **Auth**: Token-based device pairing (no username/password). iron-session encrypted cookies.
- **Push**: Web Push with VAPID. Service worker in `public/sw.js`.
- **DB**: PostgreSQL with Drizzle ORM. Direct SQL migrations (`packages/db/src/migrate.ts`).
- **Storage**: Local volume-backed attachment storage, metadata in Postgres.
- **Design**: Cyberpunk/glass design system in `globals.css`.

### Commands
```bash
pnpm dev          # Start web dev server
pnpm dev:worker   # Start worker
pnpm dev:all      # Start both
pnpm build        # Build web for production
pnpm db:migrate   # Generate Drizzle migrations

# Direct scripts (need DATABASE_URL in env)
pnpm --filter @tracker/db migrate:run   # Run SQL migrations
pnpm --filter @tracker/db bootstrap     # Generate first pairing token
pnpm --filter @tracker/db seed          # Seed test data
```

### Lore Commit Protocol

Commits follow the Lore convention:

```
<type>(<scope>): <subject>

<body>

Refs: <ticket-or-spec-reference>
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`

Scopes: `web`, `worker`, `db`, `shared`, `infra`, `docs`

Example:
```
feat(web): add project CRUD with activity events

- List, create, update, delete projects
- Activity event emission on mutations
- Glass card UI with long-press actions

Refs: .omx/plans/prd-project-tracker-v1.md Step 3
```

### Non-goals (V1)
- Multi-user / collaboration
- Git client behavior
- Generic file drive
- Backend code indexing/search
- AI integration
- Repeating reminders or snooze
