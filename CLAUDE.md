# task-api

A small TypeScript task-management REST API: CRUD over a `tasks` resource with
status filtering and cursor-based pagination on `GET /tasks`. Built on Hono +
`@hono/node-server`, persisted to SQLite via `better-sqlite3` (synchronous, no
ORM), validated with Zod. Tests run on Vitest against in-memory SQLite. There is
no auth, no frontend, and no remote infrastructure — it's a single-process API.

## Before you start work

Before executing a task that touches a subsystem, first identify whether a
reference doc governs that area and **read it before acting** — not only when
you get stuck. Check the "Reference docs — read before you work" map below, plus
any `README`/doc file near the code you're about to change. Treat the matching
doc as required pre-reading: a task looking trivial is not a reason to skip it.
This is a general rule — apply it to areas not yet listed here too, and add new
entries to the map as the codebase grows.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with watch/reload on http://localhost:3000 |
| `npm run start` | Start once (runs migrations on boot) |
| `npm run migrate` | Apply pending SQL migrations standalone |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

There is no lint/format step and no build for local dev (`tsx` runs TS directly).
Type-check via `npx tsc --noEmit` if you need it.

Env vars: `DATABASE_PATH` (default `data/tasks.db`), `PORT` (default `3000`).

## Architecture

Request flow: `routes → repository → db`. Layers stay one-directional.

```
src/
  index.ts              Entry: opens db, runs migrations, serves the app
  app.ts                Wires db → repository → routes; declares /health
  db/connection.ts      Opens better-sqlite3 (WAL, foreign_keys ON); exports DB type
  db/migrate.ts         Migration runner + `npm run migrate` CLI
  routes/tasks.ts       HTTP handlers; Zod validation at the boundary
  repositories/tasks.ts All SQL lives here; maps snake_case rows → camelCase Task
  schemas/task.ts       Zod schemas + inferred types (single source of truth)
  lib/cursor.ts         Opaque base64url cursor encode/decode
migrations/             Numbered NNNN_*.sql, applied in filename order
tests/                  Vitest suite + in-memory app helper
```

## Conventions

- **TS is strict** (`strict`, `noUnusedLocals`, `noUnusedParameters`). ESM only
  (`"type": "module"`) — relative imports MUST use the `.js` extension, even for
  `.ts` files (NodeNext resolution).
- **Repositories are factory functions** (`createXRepository(db)` returning an
  object), wired in `app.ts`. Routes receive the repo as an argument — don't
  reach for a global db or singleton.
- **All SQL stays in the repository.** Routes never touch the db. Use prepared
  statements with bound params (never string-interpolate values into SQL).
- **Zod schemas in `schemas/` are the single source of truth** for request shapes
  and types — infer types with `z.infer`, don't hand-write parallel interfaces.
- **Validate at the boundary** with `zValidator(...)`; invalid input returns 400
  automatically. Not-found returns `{ error: ... }` with 404; DELETE returns 204.
- **DB columns are snake_case; the API/`Task` type is camelCase.** The repository's
  `toTask` mapper is the only translation point.
- **Server controls `id`, `createdAt`, `updatedAt`** — clients never set them.
  Timestamps are ISO-8601 strings (`new Date().toISOString()`), stored as TEXT.
- **Tests** hit the real app via `app.request(...)` against fresh in-memory SQLite
  (`createTestApp()` in `tests/helpers.ts`); each `beforeEach` gets a clean db.

## Never do

- Don't add an ORM or query builder — raw SQL in the repository is the design.
- Don't switch `better-sqlite3` to an async db client; the code assumes sync calls.
- Don't drop the `.js` extension on relative imports (breaks at runtime).
- Don't edit a migration that's already been applied/committed — add a new one.
- Don't commit `data/` or `*.db*` files (gitignored; SQLite WAL artifacts).
- Don't parse, construct, or rely on the cursor's internal shape outside
  `lib/cursor.ts` — it's an opaque token.
- Don't bypass Zod validation or put business rules in routes that belong in the
  schema or repository.

## Reference docs — read before you work

Per "Before you start work" above: if your task falls in one of these areas,
read the matching doc *first*. This map is the source of truth for what governs
each area — keep it current when you add docs or subsystems.

| If you're about to… | Read first |
| --- | --- |
| Add or change a migration / the `tasks` schema | `docs/migrations.md` — runner mechanics, naming, the add-a-column example |
| Touch routes, the public API surface, or the task shape | `README.md` — routes, task shape, pagination/cursor usage |
| Change filtering or pagination (keyset, cursors, indexes) | `PLAN.md` — design notes + keyset rationale |

## Agent skills

### Issue tracker

Issues and PRDs live as local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/` at root). See `docs/agents/domain.md`.
