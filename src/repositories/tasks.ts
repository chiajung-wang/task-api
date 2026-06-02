import { randomUUID } from 'node:crypto';
import type { DB } from '../db/connection.js';
import type { CursorPosition } from '../lib/cursor.js';
import type { CreateTaskInput, Task, TaskStatus, UpdateTaskInput } from '../schemas/task.js';

interface ListTasksOptions {
  status?: TaskStatus;
  limit: number;
  cursor?: CursorPosition;
}

interface ListTasksResult {
  items: Task[];
  hasMore: boolean;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createTaskRepository(db: DB) {
  const repo = {
    list(options: ListTasksOptions): ListTasksResult {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (options.status) {
        conditions.push('status = ?');
        params.push(options.status);
      }

      // Keyset predicate: row-value comparison against the cursor position.
      // id is the tiebreaker because created_at is not unique.
      if (options.cursor) {
        conditions.push('(created_at, id) < (?, ?)');
        params.push(options.cursor.createdAt, options.cursor.id);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      // Fetch one extra row to detect a next page without a separate COUNT.
      const rows = db
        .prepare(
          `SELECT * FROM tasks ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
        )
        .all(...params, options.limit + 1) as TaskRow[];

      const hasMore = rows.length > options.limit;
      const items = (hasMore ? rows.slice(0, options.limit) : rows).map(toTask);
      return { items, hasMore };
    },

    get(id: string): Task | null {
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      return row ? toTask(row) : null;
    },

    create(input: CreateTaskInput): Task {
      const now = new Date().toISOString();
      const id = randomUUID();
      db.prepare(
        `INSERT INTO tasks (id, title, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, input.title, input.description ?? null, input.status ?? 'todo', now, now);
      return repo.get(id)!;
    },

    update(id: string, input: UpdateTaskInput): Task | null {
      const existing = repo.get(id);
      if (!existing) return null;
      const next = {
        title: input.title ?? existing.title,
        description: input.description !== undefined ? input.description : existing.description,
        status: input.status ?? existing.status,
        updatedAt: new Date().toISOString(),
      };
      db.prepare(
        'UPDATE tasks SET title = ?, description = ?, status = ?, updated_at = ? WHERE id = ?'
      ).run(next.title, next.description, next.status, next.updatedAt, id);
      return repo.get(id);
    },

    delete(id: string): boolean {
      return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
    },
  };

  return repo;
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
