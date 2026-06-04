import { randomUUID } from 'node:crypto';
import type { DB } from '../db/connection.js';
import type { CursorPosition } from '../lib/cursor.js';
import {
  type CreateTaskInput,
  type Task,
  type TaskStats,
  type TaskStatus,
  taskStatuses,
  type UpdateTaskInput,
} from '../schemas/task.js';

interface ListTasksOptions {
  status?: TaskStatus;
  q?: string;
  limit: number;
  cursor?: CursorPosition;
}

// Escape LIKE wildcards so user input matches literally (`\` is the ESCAPE char).
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
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
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
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

      // Case-insensitive substring match on title (SQLite LIKE is ASCII case-insensitive).
      if (options.q) {
        conditions.push("title LIKE ? ESCAPE '\\'");
        params.push(`%${escapeLike(options.q)}%`);
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
        .prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
        .all(...params, options.limit + 1) as TaskRow[];

      const hasMore = rows.length > options.limit;
      const items = (hasMore ? rows.slice(0, options.limit) : rows).map(toTask);
      return { items, hasMore };
    },

    stats(): TaskStats {
      // Seed every status at 0 so absent statuses still appear in the response.
      const byStatus = Object.fromEntries(taskStatuses.map((s) => [s, 0])) as TaskStats['byStatus'];
      const rows = db
        .prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status')
        .all() as { status: TaskStatus; count: number }[];
      let total = 0;
      for (const row of rows) {
        byStatus[row.status] = row.count;
        total += row.count;
      }
      return { total, byStatus };
    },

    get(id: string): Task | null {
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      return row ? toTask(row) : null;
    },

    create(input: CreateTaskInput): Task {
      const now = new Date().toISOString();
      const id = randomUUID();
      db.prepare(
        `INSERT INTO tasks (id, title, description, status, due_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.title,
        input.description ?? null,
        input.status ?? 'todo',
        input.dueDate ?? null,
        now,
        now,
      );
      return repo.get(id)!;
    },

    createMany(inputs: CreateTaskInput[]): Task[] {
      // One transaction for the whole batch: any failing row rolls back all of them.
      const insertAll = db.transaction((items: CreateTaskInput[]): Task[] => {
        const created: Task[] = [];
        for (const input of items) {
          created.push(repo.create(input));
        }
        return created;
      });
      return insertAll(inputs);
    },

    update(id: string, input: UpdateTaskInput): Task | null {
      const existing = repo.get(id);
      if (!existing) return null;
      const next = {
        title: input.title ?? existing.title,
        description: input.description !== undefined ? input.description : existing.description,
        status: input.status ?? existing.status,
        dueDate: input.dueDate !== undefined ? input.dueDate : existing.dueDate,
        updatedAt: new Date().toISOString(),
      };
      db.prepare(
        'UPDATE tasks SET title = ?, description = ?, status = ?, due_date = ?, updated_at = ? WHERE id = ?',
      ).run(next.title, next.description, next.status, next.dueDate, next.updatedAt, id);
      return repo.get(id);
    },

    delete(id: string): boolean {
      return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
    },
  };

  return repo;
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
