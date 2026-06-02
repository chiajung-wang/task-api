---
name: add-route
description: Add a new HTTP route to the task-api (Hono + better-sqlite3 + Zod), with tests, following project conventions. Use when the user asks to add, create, or expose a new endpoint/route on the task API.
---

# Add a route to task-api

Routes flow one direction: `routes → repository → db`. A new endpoint usually
touches three layers — the Zod schema (`src/schemas/task.ts`), the repository
(`src/repositories/tasks.ts`, where all SQL lives), and the route
(`src/routes/tasks.ts`). Don't put SQL or business rules in the route.

## Workflow

1. **Read the governing docs first.** Per `CLAUDE.md` → "Reference docs", read
   `README.md` (routes, task shape, pagination/cursor) before touching the API
   surface. If the route changes filtering/pagination, also read `PLAN.md`; if it
   needs a schema/column change, read `docs/migrations.md`.

2. **Find a similar existing handler in `src/routes/tasks.ts`** to copy the shape:
   - **Read by id** → `GET /:id` (404 with `{ error: ... }` when missing).
   - **List/collection** → `GET /` (uses `zValidator('query', ...)`, cursor pagination).
   - **Create** → `POST /` (`zValidator('json', ...)`, returns `201`).
   - **Update** → `PATCH /:id` (validate json, 404 if not found).
   - **Delete** → `DELETE /:id` (returns `204`, no body).

3. **Propose the route signature** — method, path, request shape (path params /
   query / json body), and response shape + status codes. **Wait for approval
   before writing.**

4. **After approval, implement bottom-up:**
   - Add/extend the Zod schema in `src/schemas/task.ts` (single source of truth;
     infer types with `z.infer` — don't hand-write interfaces).
   - Add a repository method in `src/repositories/tasks.ts` if data access is
     needed. Use prepared statements with bound params; map snake_case rows →
     camelCase via the existing `toTask` mapper. Add it to the `TaskRepository` type.
   - Add the handler in `src/routes/tasks.ts`. Validate at the boundary with
     `zValidator(...)`. Routes never touch the db — call the repo. **Put more
     specific paths (e.g. `/stats`) before `/:id`** so they aren't shadowed.

5. **Add tests in `tests/tasks.test.ts`** (not colocated). Use `createTestApp()`
   and hit the real app via `app.request(...)`; each `beforeEach` gets a fresh
   in-memory db. Reuse the `createTask` / `insertTask` helpers. Cover the happy
   path, the 404/validation (400) cases, and the exact status code.

6. **Run `npm test` and `npx tsc --noEmit`. Don't stop until both pass.**

7. **Summarize what changed** — files touched and the new endpoint's contract.

## Conventions to respect

- ESM: relative imports use the `.js` extension even for `.ts` files.
- Server owns `id`, `createdAt`, `updatedAt`; clients never set them. Timestamps
  are ISO-8601 strings.
- The cursor is opaque — only `lib/cursor.ts` encodes/decodes it.
- No ORM, no async db client, no editing already-applied migrations (add a new one).
