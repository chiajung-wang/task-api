# Edit a comment — PATCH /tasks/:id/comments/:commentId

Status: agent-ready
Type: AFK
Part of: api-extensions (siblings: 02-bulk-create-tasks, 03-status-transition)
GitHub: https://github.com/chiajung-wang/task-api/issues/1

## What to build

Round out the comments CRUD with an edit endpoint, matching how tasks already
support `PATCH`. `PATCH /tasks/:id/comments/:commentId` updates an existing
comment's editable fields and returns the updated comment.

End-to-end behavior:

- Validate the body at the boundary with a new `updateCommentSchema` (partial:
  `body` and `author` both optional, same constraints as create — `body` 1–2000
  chars, `author` 1–100 chars; author remains nullable).
- 404 `{ error: "Task not found" }` if the task doesn't exist; 404
  `{ error: "Comment not found" }` if the comment doesn't exist (or doesn't
  belong to the task).
- On success return the updated comment as JSON (200).

**Decision — track edit time:** comments currently store only `createdAt`. This
slice adds an `updatedAt` to the comment so edits are observable (matches the
`Task` convention). That means a new migration adding `updated_at` to the
`comments` table, exposing `updatedAt` on the `Comment` type, mapping it in the
comment repository's row mapper, and setting it on edit. All comment SQL stays
in the comment repository.

## Acceptance criteria

- [ ] `PATCH /tasks/:id/comments/:commentId` updates `body` and/or `author` and returns the updated comment (200)
- [ ] New `updateCommentSchema` validates input at the boundary; invalid input → 400
- [ ] Unknown task → 404 `Task not found`; unknown comment → 404 `Comment not found`
- [ ] New migration adds `updated_at` to `comments`; `Comment` exposes `updatedAt`; it is set on edit
- [ ] Tests cover: successful edit, partial edit, unknown task, unknown comment, validation failure
- [ ] `npm run typecheck` and `npm test` pass

## Blocked by

None - can start immediately.
