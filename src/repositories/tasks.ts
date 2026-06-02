import { randomUUID } from 'node:crypto';
import type { DB } from '../db/connection.js';
import type { CreateTaskInput, Task, TaskStatus, UpdateTaskInput } from '../schemas/task.js';

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
    list(filter: { status?: TaskStatus } = {}): Task[] {
      const rows = filter.status
        ? db
            .prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC')
            .all(filter.status)
        : db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
      return (rows as TaskRow[]).map(toTask);
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
