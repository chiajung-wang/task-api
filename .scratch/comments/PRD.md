# PRD: Comment on tasks

Status: ready-for-agent
Labels: ready-for-agent

## Problem Statement

As someone working a task through the API, I have nowhere to record context about
that task — notes, progress updates, decisions, or hand-off information. The task
itself only carries a title, description, and status, all of which get overwritten
as the task evolves. There is no append-only running log attached to a task, so any
narrative around a task lives outside the system entirely.

## Solution

Let users attach short text **comments** to a task. A comment is an immutable,
timestamped note belonging to exactly one task. Users can add a comment, list all
comments on a task (oldest-first, like reading a thread top to bottom), and delete
a comment. Comments may optionally carry a free-text `author` label, but the system
has no authentication — anyone who can reach the API can add, list, or delete.

When a task is deleted, its comments are deleted along with it.

## User Stories

1. As an API user, I want to add a comment to a task, so that I can record a note or progress update against that task.
2. As an API user, I want a comment to require a non-empty body, so that I can't accidentally create blank comments.
3. As an API user, I want a comment body to be capped at a reasonable length (2000 characters), so that comments stay short notes rather than documents.
4. As an API user, I want to optionally attach an `author` label to a comment, so that I can attribute who left the note without needing real accounts.
5. As an API user, I want to omit the `author` and have it stored as null, so that attribution is genuinely optional.
6. As an API user, I want the server to assign the comment's `id`, `taskId`, and `createdAt`, so that I never have to (and cannot) set server-controlled fields myself.
7. As an API user, I want adding a comment to a task that doesn't exist to return 404, so that I get clear feedback instead of an orphaned comment.
8. As an API user, I want a successful add to return 201 with the full created comment, so that I immediately have its server-assigned id.
9. As an API user, I want to list all comments on a task, so that I can read the full history of notes for that task.
10. As an API user, I want comments listed oldest-first, so that they read like a conversation thread from the beginning.
11. As an API user, I want listing comments on a task with no comments to return an empty list, so that "no comments" is distinct from "no such task".
12. As an API user, I want listing comments on a task that doesn't exist to return 404, so that I can tell the difference between an empty task and a missing one.
13. As an API user, I want the comment list to return every comment for the task without pagination, so that I get the complete picture in one request (comment volume per task is expected to be small).
14. As an API user, I want each listed comment to carry its `id`, `taskId`, `body`, `author`, and `createdAt`, so that I have everything I need to display or reference it.
15. As an API user, I want to delete a specific comment by its id, so that I can remove a note that's no longer wanted.
16. As an API user, I want a successful delete to return 204 with no body, so that it behaves like the existing task delete.
17. As an API user, I want deleting a comment that doesn't exist to return 404, so that I get clear feedback on a bad id.
18. As an API user, I want deleting a comment to be a hard delete, so that removed comments are genuinely gone and don't linger in lists.
19. As an API user, I want deleting a task to also delete all of its comments, so that I never have orphaned comments referencing a missing task.
20. As an API user, I want comment timestamps as ISO-8601 strings, so that they match the format used everywhere else in the API.
21. As an API user, I want comments to be immutable (no update endpoint), so that the history is an append-only log I can trust.
22. As a maintainer, I want all comment SQL to live in a dedicated repository, so that the routes stay thin and the data access is testable in isolation.
23. As a maintainer, I want comment request shapes defined by a Zod schema as the single source of truth, so that types and validation never drift apart.
24. As a maintainer, I want the comment list/delete behavior covered by tests against a fresh in-memory database, so that regressions are caught automatically.

## Implementation Decisions

**Scope note — partially built.** The add-a-comment behavior (the `POST` endpoint,
the `comments` table migration, and an initial `createCommentSchema`) already exists,
with the data-access method currently living on the tasks repository. This PRD
completes the resource (list + delete) and refactors data access into a dedicated
module. The agent should reconcile the existing pieces with the decisions below
rather than duplicating them.

**Endpoints.** Three endpoints on the nested comments collection:
- Add a comment to a task — `POST` to the task's comments collection. Body `{ body, author? }`. Returns `201` with the created comment, or `404` if the task is missing.
- List a task's comments — `GET` on the task's comments collection. Returns the full array of comments, oldest-first, or `404` if the task is missing.
- Delete a comment — `DELETE` on a single comment by id. Returns `204` on success, `404` if the comment is missing.

**No authentication / no authorization.** Consistent with the project's stated
design (no auth, single-process). `author` is an optional free-text string label,
not an identity. Anyone who can reach the API can perform any comment operation.

**Comment shape.** `{ id, taskId, body, author, createdAt }`. `author` is
`string | null`. `id`, `taskId`, and `createdAt` are server-controlled; clients
never set them. `createdAt` is an ISO-8601 string. There is no `updatedAt` —
comments are immutable.

**Validation (Zod, single source of truth).** The create-comment schema requires
`body` (1–2000 chars) and accepts an optional `author` (1–100 chars). Invalid input
returns `400` at the boundary. Types are inferred from the schema, not hand-written.

**Ordering.** The list is ordered `createdAt` ascending with `id` as the tiebreaker
(oldest-first). This intentionally differs from the newest-first task list, because
comments read naturally as a thread.

**No pagination.** The list endpoint returns all comments for the task in one
response — a plain array, not the `{ data, nextCursor }` envelope used by the task
list. Pagination can be added later if comment volume warrants it.

**Hard delete + cascade.** Deleting a comment removes the row. Deleting a task
removes its comments via the database foreign key (`ON DELETE CASCADE`), so there is
no application-level cleanup and no soft-delete column.

**Module structure — extract a comments repository (deep module).** Introduce a
`createCommentRepository(db)` factory that owns all comment SQL and exposes a small,
stable interface:
- `addComment(taskId, input)` → the created comment, or `null` if the task doesn't exist
- `listComments(taskId)` → the task's comments oldest-first (the route distinguishes "missing task" → 404 from "no comments" → empty array; the repository exposes whatever existence signal the route needs to make that distinction)
- `deleteComment(commentId)` → boolean indicating whether a row was removed

The existing `addComment` method migrates out of the tasks repository into this new
module. The comment repository is wired in the app composition root alongside the
tasks repository, and the routes receive it as an argument (no global db). The
snake_case database row → camelCase comment mapping happens only inside this
repository. The existence check before adding a comment is explicit (for a clean
404), with the foreign key as a backstop.

**Routing.** The route layer stays thin: validate at the boundary, call the
repository, translate results into `201` / `200` / `204` / `404`. Routes never touch
the database. Nested comment paths must be ordered so they aren't shadowed by the
existing `/:id` task routes.

**Schema/migration.** The `comments` table already exists (id, task_id, body,
author, created_at, with a foreign key to tasks that cascades on delete and an index
on task_id). No further migration is required for this PRD; if any is needed it must
be a new numbered file, never an edit to an applied one.

## Testing Decisions

**What makes a good test here.** Tests assert externally observable behavior —
HTTP status codes and response bodies, and repository return values — not internal
implementation details. They run against a fresh in-memory SQLite database per test
(`beforeEach`), exercising the real app rather than mocks.

**Prior art.** Mirror the existing task tests: end-to-end cases that drive the real
app via its request helper, with small local helpers to create tasks and post
comments, and a `beforeEach` that builds a clean in-memory app. The existing
`POST /tasks/:id/comments` tests (happy path, 404 unknown task, 400 missing/empty
body, author-defaults-to-null) are the template to extend.

**Modules under test (all three selected):**
- **Comment repository** — `addComment` returns the created comment and `null` for an unknown task; `listComments` returns comments oldest-first and an empty list for a task with none; `deleteComment` returns true when a row is removed and false otherwise; `author` defaults to null when omitted.
- **Comment routes (HTTP)** — add → `201` + body, list → `200` + ordered array, delete → `204`; `404` for adding/listing on an unknown task; `404` for deleting an unknown comment; `400` for an invalid or empty body; deleting a task removes its comments from subsequent listing.
- **Validation schema** — `createCommentSchema` accepts a valid body, rejects an empty body and a body over the max length, and enforces the optional `author` bounds. (Acknowledged as largely covered implicitly by the route 400 tests, but included for explicit boundary coverage.)

## Out of Scope

- Authentication and authorization of any kind (who may comment or delete).
- Editing/updating a comment — comments are immutable by design.
- Soft-delete / retention of deleted comments.
- Pagination, filtering, or sorting options on the comment list.
- Nested replies / threading, reactions, mentions, or rich text / attachments.
- Comment counts surfaced on the task object or in task list/stats responses.
- Real-time notification of new comments.

## Further Notes

- The list ordering deliberately diverges from the task list (oldest-first vs
  newest-first). If API-wide consistency later proves more valuable than thread-style
  reading, this is the one decision to revisit.
- Returning a bare array (no envelope) for the list means adding pagination later is
  a breaking change to that endpoint's response shape. That trade was accepted on the
  expectation that per-task comment volume stays small.
- `author` is intentionally a weak, unverified label. If real attribution is ever
  needed, it should arrive together with an auth story rather than by hardening this
  field in isolation.
