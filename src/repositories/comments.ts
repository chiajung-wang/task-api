import { randomUUID } from 'node:crypto';
import type { DB } from '../db/connection.js';
import type { Comment, CreateCommentInput } from '../schemas/comment.js';

interface CommentRow {
  id: string;
  task_id: string;
  body: string;
  author: string | null;
  created_at: string;
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    taskId: row.task_id,
    body: row.body,
    author: row.author,
    createdAt: row.created_at,
  };
}

export function createCommentRepository(db: DB) {
  const repo = {
    taskExists(taskId: string): boolean {
      return db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId) !== undefined;
    },

    addComment(taskId: string, input: CreateCommentInput): Comment | null {
      if (!repo.taskExists(taskId)) return null;
      const now = new Date().toISOString();
      const id = randomUUID();
      db.prepare(
        `INSERT INTO comments (id, task_id, body, author, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, taskId, input.body, input.author ?? null, now);
      const row = db
        .prepare('SELECT * FROM comments WHERE id = ?')
        .get(id) as CommentRow;
      return toComment(row);
    },

    listComments(taskId: string): Comment[] {
      const rows = db
        .prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC, id ASC')
        .all(taskId) as CommentRow[];
      return rows.map(toComment);
    },
  };

  return repo;
}

export type CommentRepository = ReturnType<typeof createCommentRepository>;
