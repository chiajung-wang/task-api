import { Hono } from 'hono';
import type { DB } from './db/connection.js';
import { createTaskRepository } from './repositories/tasks.js';
import { taskRoutes } from './routes/tasks.js';

export function createApp(db: DB) {
  const app = new Hono();
  const tasks = createTaskRepository(db);

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/tasks', taskRoutes(tasks));

  return app;
}
