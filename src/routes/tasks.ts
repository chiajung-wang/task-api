import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { TaskRepository } from '../repositories/tasks.js';
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from '../schemas/task.js';

export function taskRoutes(tasks: TaskRepository) {
  const router = new Hono();

  router.get('/', zValidator('query', listTasksQuerySchema), (c) => {
    const { status } = c.req.valid('query');
    return c.json(tasks.list({ status }));
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

  router.patch('/:id', zValidator('json', updateTaskSchema), (c) => {
    const task = tasks.update(c.req.param('id'), c.req.valid('json'));
    if (!task) return c.json({ error: 'Task not found' }, 404);
    return c.json(task);
  });

  router.delete('/:id', (c) => {
    if (!tasks.delete(c.req.param('id'))) return c.json({ error: 'Task not found' }, 404);
    return c.body(null, 204);
  });

  return router;
}
