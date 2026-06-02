# Plan: Filtering + Cursor Pagination for `GET /tasks`

Goal: add `?status`, `?limit`, and `?cursor` (cursor-based) to `GET /tasks`, returning
a `{ data, nextCursor }` envelope where `nextCursor` is present only when more rows exist.

## 1. Cursor encode/decode helper
**File:** `src/lib/cursor.ts` (new)
- Add `encodeCursor({ createdAt, id })` → base64url of JSON `{ createdAt, id }`.
- Add `decodeCursor(raw: string)` → parses base64url JSON back to `{ createdAt, id }`;
  throws on malformed input (caller turns this into a 400).
- Keeps encoding opaque and isolated from the repository and schema.

## 2. Extend the query schema
**File:** `src/schemas/task.ts`
- Extend `listTasksQuerySchema`:
  - `status`: unchanged (optional enum).
  - `limit`: `z.coerce.number().int().positive().max(100).default(20)` — string-coerced,
    bounded, with a default.
  - `cursor`: optional string with a `.transform()` that calls `decodeCursor`; on failure
    raise a Zod issue so a bad cursor becomes a 400 at the boundary.
- Export an inferred type (e.g. `ListTasksQuery`) so the route and repo share one shape.

## 3. Update the repository `list()`
**File:** `src/repositories/tasks.ts`
- Change `list()` signature to accept `{ status?, limit, cursor? }` where `cursor` is the
  decoded `{ createdAt, id }` position.
- Order by `created_at DESC, id DESC` (id as tiebreaker — `created_at` is not unique).
- When a cursor is given, add keyset predicate `(created_at, id) < (?, ?)` (row-value
  comparison), combined with the optional `status = ?` filter.
- Fetch `limit + 1` rows to detect a next page without a separate COUNT.
- Return `{ items: Task[], hasMore: boolean }` — trim the extra row, set `hasMore` from it.

## 4. Update the route handler
**File:** `src/routes/tasks.ts`
- In `GET /`, read validated `{ status, limit, cursor }` from `c.req.valid('query')`.
- Call the new `tasks.list(...)`.
- Build response envelope `{ data: items }`, and add `nextCursor` (from the last item's
  `createdAt`/`id` via `encodeCursor`) only when `hasMore` is true.
- Response shape changes from bare `Task[]` to `{ data, nextCursor? }` (breaking — see step 6).

## 5. (Optional) Supporting index
**File:** `migrations/0002_tasks_pagination_index.sql` (new)
- Add index on `(status, created_at, id)` (and/or `(created_at, id)`) to back the keyset
  scan. Optional at course scale; correctness does not depend on it.

## 6. Update tests
**File:** `tests/tasks.test.ts`
- Fix existing `GET /tasks` test for the new envelope: assert on `body.data` length and
  `body.data[0].title` instead of the bare array.
- Add new cases:
  - `?limit=N` returns at most N items and a `nextCursor` when more exist.
  - Following `nextCursor` returns the next page with no overlap and no skips
    (specifically cover tasks created in the same millisecond → tiebreaker works).
  - Last page omits `nextCursor`.
  - `?status` + pagination together stay within the filter.
  - Malformed `?cursor` returns 400; out-of-range/zero `?limit` returns 400.

## 7. Update docs
**File:** `README.md`
- Document the new query params, the `{ data, nextCursor }` response shape, and that the
  cursor is an opaque token to be passed back verbatim.

## Notes / assumptions
- Keyset on `created_at` TEXT is safe because `toISOString()` is fixed-width UTC (`...Z`),
  so lexicographic order matches chronological order.
- A cursor is only valid within the same `status` filter; changing the filter invalidates it.
