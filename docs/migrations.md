# Migrations

Raw SQL files in `migrations/`, applied in filename order. No ORM, no
down-migrations. There is no generator — you create the file by hand and the
runner (`src/db/migrate.ts`) picks it up.

## Create a new migration

Find the highest existing number, then create the next one:

```bash
touch migrations/0003_add_due_date.sql
```

(`0001` and `0002` exist today, so the next is `0003`.)

## Naming convention

`NNNN_short_description.sql` — a 4-digit zero-padded sequence number, an
underscore, then a snake_case description. Numbering drives apply order, so it
must be sequential and unique.

## Applying

`runMigrations` ensures a `_migrations(name, applied_at)` table, then applies
each unrecorded `*.sql` (sorted by filename) in its own transaction. It runs
automatically on `npm run start` and in tests; `npm run migrate` runs it
standalone against `DATABASE_PATH` (default `data/tasks.db`).

## Rules

- **Only ever migrate the local SQLite file.** Never point `DATABASE_PATH` at a
  shared, staging, or production database and run `migrate` / `start` against it.
  This project targets the local `data/tasks.db` (or in-memory in tests) only.
- **Never edit an applied migration** — the runner keys off filename, so edits to
  an already-recorded file are silently skipped. Add a new file instead.

## Example: adding a column

Before — `tasks` has no due date. Add `migrations/0003_add_due_date.sql`:

```sql
-- before: tasks(id, title, description, status, created_at, updated_at)
ALTER TABLE tasks ADD COLUMN due_date TEXT;
-- after: same columns plus a nullable due_date (ISO-8601 string)
```

Then run `npm run migrate` (or just restart / run the tests).
