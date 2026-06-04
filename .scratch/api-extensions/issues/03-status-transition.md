# Status transition shortcut — PATCH /tasks/:id/status

Status: agent-ready
Type: AFK
Part of: api-extensions (siblings: 01-edit-comment, 02-bulk-create-tasks)
GitHub: https://github.com/chiajung-wang/task-api/issues/3

## What to build

A focused endpoint to move a task between statuses without sending a full task
body, and the natural home for status-transition business rules. `PATCH
/tasks/:id/status` accepts a target status and applies it only if the move is
legal.

End-to-end behavior:

- Request body `{ "status": <TaskStatus> }`, validated at the boundary; invalid
  enum → 400.
- 404 `{ error: "Task not found" }` if the task doesn't exist.
- Enforce a transition matrix (statuses: `todo`, `in_progress`, `done`). The
  legality logic lives in the schema/repository per project conventions — NOT
  scattered in the route. An illegal transition returns **422** with an error
  body describing the rejected move.
- A legal move updates `status` (and `updatedAt`) and returns the updated task
  (200).

**Decision — transition matrix (approved):**

```
todo        → in_progress
in_progress → done | todo
done        → in_progress      (reopen)

same-status (e.g. todo → todo) → allowed, idempotent no-op (200)
any other move                 → 422
```

## Acceptance criteria

- [ ] `PATCH /tasks/:id/status` applies a legal transition and returns the updated task (200)
- [ ] Illegal transition → 422 with an explanatory error body; task unchanged
- [ ] Same-status request is an idempotent no-op (200)
- [ ] Unknown task → 404; invalid status value → 400
- [ ] Transition rules live in the schema/repo, not the route
- [ ] Tests cover: each legal move, representative illegal moves, same-status no-op, unknown task, invalid value
- [ ] `npm run typecheck` and `npm test` pass

## Blocked by

None - can start immediately.
