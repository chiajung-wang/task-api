import { Hono } from 'hono';
import type { DB } from './db/connection.js';
import { createCommentRepository } from './repositories/comments.js';
import { createTaskRepository } from './repositories/tasks.js';
import { commentRoutes } from './routes/comments.js';
import { taskRoutes } from './routes/tasks.js';

export function createApp(db: DB) {
  const app = new Hono();
  const tasks = createTaskRepository(db);
  const comments = createCommentRepository(db);

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/tasks', taskRoutes(tasks));
  app.route('/tasks', commentRoutes(comments));

  return app;
}
