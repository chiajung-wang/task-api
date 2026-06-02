# task-api

A small TypeScript task management API built on Hono + better-sqlite3.

## Stack

- **Hono** + `@hono/node-server` — HTTP server
- **better-sqlite3** — SQLite storage
- **Zod** — request validation & shared types
- **Vitest** — tests (against in-memory SQLite)
- **tsx** — run/watch TypeScript directly
- Raw `.sql` migration files (no ORM)

## Getting started

```bash
npm install
npm run migrate   # apply migrations to data/tasks.db
npm run dev       # start with watch mode on http://localhost:3000
```

`npm run start` runs migrations automatically on boot, so `npm run migrate` is
only needed when you want to apply them standalone.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the server with file watching |
| `npm run start` | Start the server once |
| `npm run migrate` | Apply pending SQL migrations |
| `npm test` | Run the test suite |
| `npm run test:watch` | Run tests in watch mode |

## Routes

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/tasks` | List tasks (`?status=todo\|doing\|done` to filter) |
| `GET` | `/tasks/:id` | Get one task |
| `POST` | `/tasks` | Create a task |
| `PATCH` | `/tasks/:id` | Update a task |
| `DELETE` | `/tasks/:id` | Delete a task |

### Task shape

```jsonc
{
  "id": "uuid",
  "title": "string",
  "description": "string | null",
  "status": "todo | doing | done",
  "createdAt": "ISO-8601 string",
  "updatedAt": "ISO-8601 string"
}
```

`id`, `createdAt`, and `updatedAt` are server-controlled. On create, only
`title` is required; `status` defaults to `todo`.

## Project layout

```
src/
  index.ts            Entry point — boots the server
  app.ts              Wires the db, repository, and routes together
  db/
    connection.ts     Opens better-sqlite3
    migrate.ts        Migration runner (+ `npm run migrate` CLI)
  routes/tasks.ts     HTTP handlers
  repositories/tasks.ts  SQL queries
  schemas/task.ts     Zod schemas + types
migrations/           Numbered .sql files, applied in order
tests/                Vitest suite
```

## Migrations

Add a new file named `NNNN_description.sql` to `migrations/`. The runner tracks
applied files in a `_migrations` table and applies each pending file (in
filename order) inside a transaction.
