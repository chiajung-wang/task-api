# Bulk create tasks — POST /tasks/bulk

Status: agent-ready
Type: AFK
Part of: api-extensions (siblings: 01-edit-comment, 03-status-transition)
GitHub: https://github.com/chiajung-wang/task-api/issues/2

## What to build

A batch-create endpoint that inserts many tasks atomically, playing to
better-sqlite3's synchronous strength. `POST /tasks/bulk` accepts an array of
task inputs and inserts them in a single transaction, returning the created
tasks.

End-to-end behavior:

- Request body is a JSON **array** of task inputs, each validated against the
  existing `createTaskSchema`. Validate the whole array at the boundary
  (`z.array(createTaskSchema).min(1).max(100)`); invalid input → 400.
- Insert all rows inside one `db.transaction(...)` in the task repository.
  **All-or-nothing:** if any insert fails, the whole batch rolls back and nothing
  is persisted.
- On success return 201 with `{ data: [...createdTasks] }` (echoes the
  `GET /tasks` envelope), preserving input order. Server still controls `id`,
  `createdAt`, `updatedAt` for every row.

**Decisions:**
- Batch size capped at 100 (enforced by the schema's `.max(100)`).
- Atomic batch (no partial success) — simplest correct semantics; partial-success
  reporting is out of scope.

## Acceptance criteria

- [ ] `POST /tasks/bulk` with a valid array creates all tasks and returns 201 `{ data: [...] }`
- [ ] Insertion happens in a single transaction; a bad row rolls the whole batch back (DB unchanged)
- [ ] Empty array → 400; array over 100 → 400; any invalid task → 400
- [ ] All SQL stays in the task repository; route only validates + delegates
- [ ] Tests cover: successful batch, rollback on a failing row, empty array, over-cap array, validation failure
- [ ] `npm run typecheck` and `npm test` pass

## Blocked by

None - can start immediately.
