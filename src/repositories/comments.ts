import { randomUUID } from 'node:crypto';
import type { DB } from '../db/connection.js';
import type { Comment, CreateCommentInput, UpdateCommentInput } from '../schemas/comment.js';

interface CommentRow {
  id: string;
  task_id: string;
  body: string;
  author: string | null;
  created_at: string;
  updated_at: string | null;
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    taskId: row.task_id,
    body: row.body,
    author: row.author,
    createdAt: row.created_at,
    // Rows predating the updated_at column fall back to created_at (un-edited).
    updatedAt: row.updated_at ?? row.created_at,
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
        `INSERT INTO comments (id, task_id, body, author, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, taskId, input.body, input.author ?? null, now, now);
      const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow;
      return toComment(row);
    },

    updateComment(taskId: string, commentId: string, input: UpdateCommentInput): Comment | null {
      // Scope the lookup to the task so a comment from another task isn't editable here.
      const existing = db
        .prepare('SELECT * FROM comments WHERE id = ? AND task_id = ?')
        .get(commentId, taskId) as CommentRow | undefined;
      if (!existing) return null;

      const next = {
        body: input.body ?? existing.body,
        author: input.author !== undefined ? input.author : existing.author,
        updatedAt: new Date().toISOString(),
      };
      db.prepare('UPDATE comments SET body = ?, author = ?, updated_at = ? WHERE id = ?').run(
        next.body,
        next.author,
        next.updatedAt,
        commentId,
      );
      const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as CommentRow;
      return toComment(row);
    },

    listComments(taskId: string): Comment[] {
      const rows = db
        .prepare('SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC, id ASC')
        .all(taskId) as CommentRow[];
      return rows.map(toComment);
    },

    deleteComment(commentId: string): boolean {
      return db.prepare('DELETE FROM comments WHERE id = ?').run(commentId).changes > 0;
    },
  };

  return repo;
}

export type CommentRepository = ReturnType<typeof createCommentRepository>;
