# Implementation Plan: Comment on tasks

Source PRD: `.scratch/comments/PRD.md`

Multi-phase, tracer-bullet-first. Each phase is a thin vertical slice that leaves
the full test suite green and fits in a single working session. Phase 1 is the
tracer: the minimum end-to-end path (DB → repository → route → response) through the
new comments module, happy path only.

**Starting state (committed in `3659c93`):** the add-a-comment path already exists —
`migrations/0004_create_comments.sql` (table + FK cascade + index), a
`createCommentSchema` and `Comment` type in `src/schemas/task.ts`, an `addComment`
method on the **tasks** repository, a `POST /tasks/:id/comments` handler in
`src/routes/tasks.ts`, and tests in `tests/tasks.test.ts`. The plan reconciles these
existing pieces into a dedicated module rather than duplicating them.

**Route shapes (whole feature):**
- `POST /tasks/:id/comments` — add (exists)
- `GET /tasks/:id/comments` — list, oldest-first, return all
- `DELETE /tasks/:id/comments/:commentId` — hard delete

---

## Phase 1 — Tracer bullet: carve out the comments module

**Goal:** prove the full DB → repository → route → response path through a dedicated
comments module, using the single already-working operation (add). Pure
restructure — `POST` behavior is byte-for-byte identical, so tests stay green by
moving, not rewriting.

| File | What changes |
| --- | --- |
| `src/schemas/comment.ts` | **New.** Move `Comment` interface, `createCommentSchema`, and `CreateCommentInput` here — comments' single source of truth. |
| `src/schemas/task.ts` | Remove the comment interface/schema/type now living in `comment.ts`. |
| `src/repositories/comments.ts` | **New.** `createCommentRepository(db)` deep module. Move `CommentRow`, `toComment`, and `addComment` out of the tasks repo. The repo checks task existence itself (`SELECT 1 FROM tasks WHERE id = ?`) so it stays self-contained — no cross-repo dependency. Export `CommentRepository` type. |
| `src/repositories/tasks.ts` | Remove `addComment`, `CommentRow`, `toComment`, and the comment-related imports. Tasks repo returns to tasks-only concerns. |
| `src/routes/comments.ts` | **New.** `commentRoutes(comments)` router with the `POST /:id/comments` handler (validate → repo → `201`, or `404` if task missing). |
| `src/routes/tasks.ts` | Remove the `POST /:id/comments` handler and the `createCommentSchema` import. |
| `src/app.ts` | Create the comment repo; mount `app.route('/tasks', commentRoutes(comments))` alongside `taskRoutes`. |
| `tests/comments.test.ts` | **New.** Move the existing `POST /tasks/:id/comments` describe block here (happy path, 404 unknown task, 400 missing/empty body, author-defaults-to-null). |
| `tests/tasks.test.ts` | Remove the moved comment describe block. |

**Green check:** `npm test` passes (same assertions, new module); `npx tsc --noEmit`
shows no new `src/` errors.

---

## Phase 2 — List a task's comments

**Goal:** add the read path. `GET /tasks/:id/comments` returns every comment for the
task, oldest-first, or `404` if the task doesn't exist.

| File | What changes |
| --- | --- |
| `src/repositories/comments.ts` | Add `listComments(taskId)` → `Comment[]` ordered `created_at ASC, id ASC`. Add (or reuse) a task-existence signal so the route can tell "missing task" (404) from "no comments" (empty array). |
| `src/routes/comments.ts` | Add `GET /:id/comments`: `404` when the task is missing, else `200` with a bare array (no pagination envelope). |
| `tests/comments.test.ts` | Add: list returns comments oldest-first; empty array for a task with no comments; `404` for an unknown task. |
| `README.md` | Add the `GET /tasks/:id/comments` row to the routes table. |

**Green check:** new list tests pass; all prior tests still green.

---

## Phase 3 — Delete a comment (hard delete + cascade)

**Goal:** add the delete path and confirm task-deletion cascades to comments.

| File | What changes |
| --- | --- |
| `src/repositories/comments.ts` | Add `deleteComment(commentId)` → `boolean` (true when a row was removed). |
| `src/routes/comments.ts` | Add `DELETE /:id/comments/:commentId`: `204` on success, `404` when the comment doesn't exist. Deletes by `commentId`. |
| `tests/comments.test.ts` | Add: delete returns `204` and the comment disappears from the list; `404` for an unknown comment; deleting a **task** removes its comments from a subsequent list (FK `ON DELETE CASCADE` from migration `0004`). |
| `README.md` | Add the `DELETE /tasks/:id/comments/:commentId` row to the routes table. |

**Green check:** delete + cascade tests pass; full suite green.

---

## Phase 4 — Test completion + docs

**Goal:** round out coverage to all three modules named in the PRD and update project
docs so the new subsystem is discoverable.

| File | What changes |
| --- | --- |
| `tests/comments.test.ts` | Add repository-level assertions (`addComment` returns `null` for unknown task; `listComments` ordering; `deleteComment` true/false) and explicit `createCommentSchema` boundary tests (body 1–2000, optional author 1–100). |
| `CLAUDE.md` | Add `repositories/comments.ts`, `routes/comments.ts`, `schemas/comment.ts` to the architecture tree; add a "Reference docs — read before you work" row for the comments subsystem pointing at `README.md` + this plan. |
| `README.md` | Confirm the "Comment shape" section reflects immutability (no `updatedAt`) and the no-envelope list response. |

**Green check:** full suite green; `npx tsc --noEmit` clean in `src/`.

---

## Notes

- **Ordering divergence is intentional:** comments list oldest-first vs the task
  list's newest-first (thread-reading). Flagged in the PRD as the one decision to
  revisit if API-wide consistency wins out.
- **No new migration needed** — `0004_create_comments.sql` already supplies the
  table, the cascading foreign key, and the `task_id` index. If any change is needed,
  add a new numbered file; never edit an applied one.
- **Bare-array list response** means adding pagination later is a breaking change to
  that endpoint — accepted on the assumption that per-task comment volume stays small.
- Phases 1–3 are AFK-ready (no human decisions). Phase 4 is housekeeping and can fold
  into 3 if a session has room.
