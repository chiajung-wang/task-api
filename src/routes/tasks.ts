import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { encodeCursor } from '../lib/cursor.js';
import type { TaskRepository } from '../repositories/tasks.js';
import {
  bulkCreateTasksSchema,
  createTaskSchema,
  listTasksQuerySchema,
  statusTransitionSchema,
  updateTaskSchema,
} from '../schemas/task.js';

export function taskRoutes(tasks: TaskRepository) {
  const router = new Hono();

  router.get('/', zValidator('query', listTasksQuerySchema), (c) => {
    const { status, q, limit, cursor } = c.req.valid('query');
    const { items, hasMore } = tasks.list({ status, q, limit, cursor });
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor({
            createdAt: items[items.length - 1]!.createdAt,
            id: items[items.length - 1]!.id,
          })
        : undefined;
    return c.json({ data: items, ...(nextCursor ? { nextCursor } : {}) });
  });

  router.get('/stats', (c) => {
    return c.json(tasks.stats());
  });

  router.get('/:id', (c) => {
    const task = tasks.get(c.req.param('id'));
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json(task);
  });

  router.post('/', zValidator('json', createTaskSchema), (c) => {
    const task = tasks.create(c.req.valid('json'));
    return c.json(task, 201);
  });

  router.post('/bulk', zValidator('json', bulkCreateTasksSchema), (c) => {
    const created = tasks.createMany(c.req.valid('json'));
    return c.json({ data: created }, 201);
  });

  router.patch('/:id', zValidator('json', updateTaskSchema), (c) => {
    const task = tasks.update(c.req.param('id'), c.req.valid('json'));
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json(task);
  });

  router.patch('/:id/status', zValidator('json', statusTransitionSchema), (c) => {
    const result = tasks.transitionStatus(c.req.param('id'), c.req.valid('json').status);
    if (!result.ok) {
      if (result.reason === 'not_found') return c.json({ error: 'Task not found' }, 404);
      return c.json({ error: `Illegal status transition: ${result.from} → ${result.to}` }, 422);
    }
    return c.json(result.task);
  });

  router.delete('/:id', (c) => {
    if (!tasks.delete(c.req.param('id'))) return c.json({ error: 'Task not found' }, 404);
    return c.body(null, 204);
  });

  return router;
}
