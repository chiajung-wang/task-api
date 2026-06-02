import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

let app: ReturnType<typeof createTestApp>['app'];

beforeEach(() => {
  app = createTestApp().app;
});

async function createTask(body: Record<string, unknown>) {
  return app.request('/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /tasks', () => {
  it('creates a task with defaults', async () => {
    const res = await createTask({ title: 'Write tests' });
    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task).toMatchObject({
      title: 'Write tests',
      description: null,
      status: 'todo',
    });
    expect(task.id).toBeTypeOf('string');
    expect(task.createdAt).toBe(task.updatedAt);
  });

  it('rejects a missing title with 400', async () => {
    const res = await createTask({ description: 'no title' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid status with 400', async () => {
    const res = await createTask({ title: 'x', status: 'archived' });
    expect(res.status).toBe(400);
  });
});

describe('GET /tasks', () => {
  it('lists tasks and filters by status', async () => {
    await createTask({ title: 'a', status: 'todo' });
    await createTask({ title: 'b', status: 'done' });

    const all = await (await app.request('/tasks')).json();
    expect(all).toHaveLength(2);

    const done = await (await app.request('/tasks?status=done')).json();
    expect(done).toHaveLength(1);
    expect(done[0].title).toBe('b');
  });
});

describe('GET /tasks/:id', () => {
  it('returns a task', async () => {
    const { id } = await (await createTask({ title: 'find me' })).json();
    const res = await app.request(`/tasks/${id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe('find me');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/tasks/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id', () => {
  it('updates fields and bumps updatedAt', async () => {
    const created = await (await createTask({ title: 'original' })).json();
    // Ensure the timestamp can differ.
    await new Promise((r) => setTimeout(r, 5));

    const res = await app.request(`/tasks/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'doing' }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.status).toBe('doing');
    expect(updated.title).toBe('original');
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it('rejects an empty body with 400', async () => {
    const created = await (await createTask({ title: 'x' })).json();
    const res = await app.request(`/tasks/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/tasks/nope', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes a task', async () => {
    const { id } = await (await createTask({ title: 'remove me' })).json();
    const res = await app.request(`/tasks/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect((await app.request(`/tasks/${id}`)).status).toBe(404);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/tasks/nope', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
