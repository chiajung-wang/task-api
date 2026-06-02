import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

let app: ReturnType<typeof createTestApp>['app'];
let db: ReturnType<typeof createTestApp>['db'];

beforeEach(() => {
  const ctx = createTestApp();
  app = ctx.app;
  db = ctx.db;
});

async function createTask(body: Record<string, unknown>) {
  return app.request('/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Inserts a row directly so created_at (and same-ms collisions) are controllable. */
function insertTask(row: { id: string; title: string; status?: string; createdAt: string }) {
  db.prepare(
    `INSERT INTO tasks (id, title, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(row.id, row.title, null, row.status ?? 'todo', row.createdAt, row.createdAt);
}

async function listPage(query: string) {
  const res = await app.request(`/tasks?${query}`);
  return { status: res.status, body: await res.json() };
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
    expect(all.data).toHaveLength(2);

    const done = await (await app.request('/tasks?status=done')).json();
    expect(done.data).toHaveLength(1);
    expect(done.data[0].title).toBe('b');
  });
});

describe('GET /tasks pagination', () => {
  it('caps results at ?limit and returns nextCursor when more exist', async () => {
    insertTask({ id: 'a', title: 't1', createdAt: '2026-01-01T00:00:00.000Z' });
    insertTask({ id: 'b', title: 't2', createdAt: '2026-01-01T00:00:01.000Z' });
    insertTask({ id: 'c', title: 't3', createdAt: '2026-01-01T00:00:02.000Z' });

    const { body } = await listPage('limit=2');
    expect(body.data).toHaveLength(2);
    expect(body.nextCursor).toBeTypeOf('string');
    // Newest first: created_at DESC.
    expect(body.data.map((t: { title: string }) => t.title)).toEqual(['t3', 't2']);
  });

  it('walks pages via nextCursor with no overlap or skips (same-ms tiebreaker)', async () => {
    // All five share one millisecond, so the id tiebreaker alone orders them.
    const ts = '2026-01-01T00:00:00.000Z';
    for (const id of ['id-1', 'id-2', 'id-3', 'id-4', 'id-5']) {
      insertTask({ id, title: id, createdAt: ts });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const q = cursor ? `limit=2&cursor=${encodeURIComponent(cursor)}` : 'limit=2';
      const { body } = await listPage(q);
      seen.push(...body.data.map((t: { id: string }) => t.id));
      cursor = body.nextCursor;
      expect(++pages).toBeLessThan(10); // guard against an infinite loop
    } while (cursor);

    // id DESC tiebreaker, every row exactly once.
    expect(seen).toEqual(['id-5', 'id-4', 'id-3', 'id-2', 'id-1']);
    expect(new Set(seen).size).toBe(5);
  });

  it('omits nextCursor on the last page', async () => {
    insertTask({ id: 'a', title: 't1', createdAt: '2026-01-01T00:00:00.000Z' });
    insertTask({ id: 'b', title: 't2', createdAt: '2026-01-01T00:00:01.000Z' });

    const { body } = await listPage('limit=2');
    expect(body.data).toHaveLength(2);
    expect(body.nextCursor).toBeUndefined();
  });

  it('keeps the ?status filter across paginated pages', async () => {
    insertTask({ id: 'a', title: 'todo-1', status: 'todo', createdAt: '2026-01-01T00:00:00.000Z' });
    insertTask({ id: 'b', title: 'done-1', status: 'done', createdAt: '2026-01-01T00:00:01.000Z' });
    insertTask({ id: 'c', title: 'todo-2', status: 'todo', createdAt: '2026-01-01T00:00:02.000Z' });
    insertTask({ id: 'd', title: 'todo-3', status: 'todo', createdAt: '2026-01-01T00:00:03.000Z' });

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const base = `status=todo&limit=2`;
      const q = cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
      const { body } = await listPage(q);
      for (const t of body.data) {
        expect(t.status).toBe('todo');
        seen.push(t.title);
      }
      cursor = body.nextCursor;
    } while (cursor);

    expect(seen.sort()).toEqual(['todo-1', 'todo-2', 'todo-3']);
  });

  it('rejects a malformed ?cursor with 400', async () => {
    const res = await app.request('/tasks?cursor=not-a-valid-cursor');
    expect(res.status).toBe(400);
  });

  it('rejects a zero or out-of-range ?limit with 400', async () => {
    expect((await app.request('/tasks?limit=0')).status).toBe(400);
    expect((await app.request('/tasks?limit=101')).status).toBe(400);
    expect((await app.request('/tasks?limit=-1')).status).toBe(400);
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
