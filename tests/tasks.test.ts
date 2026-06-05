import { beforeEach, describe, expect, it } from 'vitest';
import { createTaskRepository } from '../src/repositories/tasks.js';
import { type CreateTaskInput, isLegalTransition } from '../src/schemas/task.js';
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
     VALUES (?, ?, ?, ?, ?, ?)`,
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

describe('POST /tasks/bulk', () => {
  async function bulkCreate(body: unknown) {
    return app.request('/tasks/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('creates many tasks in one call, preserving order', async () => {
    const res = await bulkCreate([
      { title: 'first' },
      { title: 'second', status: 'doing' },
      { title: 'third', description: 'with desc' },
    ]);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toHaveLength(3);
    expect(data.map((t: { title: string }) => t.title)).toEqual(['first', 'second', 'third']);
    // Server controls id/timestamps for every row.
    for (const task of data) {
      expect(task.id).toBeTypeOf('string');
      expect(task.createdAt).toBe(task.updatedAt);
    }
    expect(data[1].status).toBe('doing');
    expect(data[0].status).toBe('todo');
  });

  it('persists every created task', async () => {
    await bulkCreate([{ title: 'a' }, { title: 'b' }]);
    const { body } = await listPage('limit=10');
    expect(body.data).toHaveLength(2);
  });

  it('rejects an empty array with 400', async () => {
    expect((await bulkCreate([])).status).toBe(400);
  });

  it('rejects a batch over 100 with 400', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ title: `t${i}` }));
    expect((await bulkCreate(tooMany)).status).toBe(400);
  });

  it('rejects the whole batch (400) if any task is invalid, persisting nothing', async () => {
    const res = await bulkCreate([{ title: 'ok' }, { title: '' }]);
    expect(res.status).toBe(400);
    const { body } = await listPage('limit=10');
    expect(body.data).toHaveLength(0);
  });
});

describe('task repository bulk create', () => {
  it('rolls back the entire batch when a row fails at the db layer', () => {
    const repo = createTaskRepository(db);
    // Second row violates the status CHECK constraint, bypassing Zod to hit the db.
    const inputs = [
      { title: 'good' },
      { title: 'bad', status: 'nope' as unknown },
    ] as CreateTaskInput[];

    expect(() => repo.createMany(inputs)).toThrow();
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number };
    expect(n).toBe(0);
  });

  it('returns created tasks in input order', () => {
    const repo = createTaskRepository(db);
    const created = repo.createMany([{ title: 'one' }, { title: 'two' }]);
    expect(created.map((t) => t.title)).toEqual(['one', 'two']);
  });
});

describe('task dueDate', () => {
  const due = '2026-12-31T23:59:59.000Z';

  it('defaults dueDate to null when omitted', async () => {
    const task = await (await createTask({ title: 'no due date' })).json();
    expect(task.dueDate).toBeNull();
  });

  it('stores a dueDate provided on create', async () => {
    const res = await createTask({ title: 'with due date', dueDate: due });
    expect(res.status).toBe(201);
    expect((await res.json()).dueDate).toBe(due);
  });

  it('rejects a non-ISO-8601 dueDate with 400', async () => {
    expect((await createTask({ title: 'x', dueDate: 'next tuesday' })).status).toBe(400);
    expect((await createTask({ title: 'x', dueDate: '2026-13-01' })).status).toBe(400);
  });

  it('sets dueDate via PATCH', async () => {
    const { id } = await (await createTask({ title: 'patch me' })).json();
    const res = await app.request(`/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dueDate: due }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).dueDate).toBe(due);
  });

  it('clears dueDate when PATCHed to null', async () => {
    const { id } = await (await createTask({ title: 'clear me', dueDate: due })).json();
    const res = await app.request(`/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dueDate: null }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).dueDate).toBeNull();
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

describe('GET /tasks?q (title search)', () => {
  it('returns only tasks whose title contains the substring', async () => {
    await createTask({ title: 'Buy milk' });
    await createTask({ title: 'Buy eggs' });
    await createTask({ title: 'Walk the dog' });

    const { body } = await listPage('q=buy');
    expect(body.data.map((t: { title: string }) => t.title).sort()).toEqual([
      'Buy eggs',
      'Buy milk',
    ]);
  });

  it('matches case-insensitively', async () => {
    await createTask({ title: 'Refactor Cursor Logic' });

    const { body } = await listPage('q=CURSOR');
    expect(body.data.map((t: { title: string }) => t.title)).toEqual(['Refactor Cursor Logic']);
  });

  it('returns an empty array (not an error) when nothing matches', async () => {
    await createTask({ title: 'Buy milk' });

    const { status, body } = await listPage('q=xyzzy');
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('combines the title search with the status filter', async () => {
    await createTask({ title: 'Deploy api', status: 'todo' });
    await createTask({ title: 'Deploy api', status: 'done' });
    await createTask({ title: 'Write docs', status: 'todo' });

    const { body } = await listPage('q=deploy&status=todo');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Deploy api');
    expect(body.data[0].status).toBe('todo');
  });

  it('treats LIKE wildcards in the query as literal characters', async () => {
    await createTask({ title: '50% off sale' });
    await createTask({ title: '50 cents' });

    const { body } = await listPage(`q=${encodeURIComponent('50%')}`);
    expect(body.data.map((t: { title: string }) => t.title)).toEqual(['50% off sale']);
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

describe('GET /tasks due-date filters', () => {
  /** Direct insert so we can control dueDate (including null) and createdAt. */
  function insertWithDue(row: {
    id: string;
    title: string;
    status?: string;
    dueDate: string | null;
    createdAt?: string;
  }) {
    const ts = row.createdAt ?? '2026-01-01T00:00:00.000Z';
    db.prepare(
      `INSERT INTO tasks (id, title, description, status, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.title, null, row.status ?? 'todo', row.dueDate, ts, ts);
  }

  it('?dueBefore returns only tasks with dueDate strictly before the cutoff', async () => {
    insertWithDue({ id: 'a', title: 'early', dueDate: '2026-06-01T00:00:00.000Z' });
    insertWithDue({ id: 'b', title: 'cutoff', dueDate: '2026-07-01T00:00:00.000Z' });
    insertWithDue({ id: 'c', title: 'late', dueDate: '2026-08-01T00:00:00.000Z' });

    const { body } = await listPage('dueBefore=2026-07-01T00:00:00.000Z');
    expect(body.data.map((t: { title: string }) => t.title).sort()).toEqual(['early']);
  });

  it('?dueAfter returns only tasks with dueDate strictly after the cutoff', async () => {
    insertWithDue({ id: 'a', title: 'early', dueDate: '2026-06-01T00:00:00.000Z' });
    insertWithDue({ id: 'b', title: 'cutoff', dueDate: '2026-07-01T00:00:00.000Z' });
    insertWithDue({ id: 'c', title: 'late', dueDate: '2026-08-01T00:00:00.000Z' });

    const { body } = await listPage('dueAfter=2026-07-01T00:00:00.000Z');
    expect(body.data.map((t: { title: string }) => t.title).sort()).toEqual(['late']);
  });

  it('combines dueBefore and dueAfter into a half-open window', async () => {
    insertWithDue({ id: 'a', title: 'early', dueDate: '2026-05-01T00:00:00.000Z' });
    insertWithDue({ id: 'b', title: 'mid', dueDate: '2026-06-15T00:00:00.000Z' });
    insertWithDue({ id: 'c', title: 'late', dueDate: '2026-08-01T00:00:00.000Z' });

    const { body } = await listPage(
      'dueAfter=2026-06-01T00:00:00.000Z&dueBefore=2026-07-01T00:00:00.000Z',
    );
    expect(body.data.map((t: { title: string }) => t.title)).toEqual(['mid']);
  });

  it('excludes null-dueDate tasks from dueBefore, dueAfter, and overdue', async () => {
    insertWithDue({ id: 'a', title: 'no-due', dueDate: null });
    insertWithDue({ id: 'b', title: 'past', dueDate: '2026-01-01T00:00:00.000Z' });

    const before = await listPage('dueBefore=2030-01-01T00:00:00.000Z');
    expect(before.body.data.map((t: { title: string }) => t.title)).toEqual(['past']);

    const after = await listPage('dueAfter=2025-01-01T00:00:00.000Z');
    expect(after.body.data.map((t: { title: string }) => t.title)).toEqual(['past']);

    const overdue = await listPage('overdue=true');
    expect(overdue.body.data.map((t: { title: string }) => t.title)).toEqual(['past']);
  });

  it('?overdue=true returns only past-due, non-done tasks', async () => {
    const past = '2020-01-01T00:00:00.000Z';
    const future = '2099-01-01T00:00:00.000Z';
    insertWithDue({ id: 'a', title: 'past-todo', status: 'todo', dueDate: past });
    insertWithDue({ id: 'b', title: 'past-doing', status: 'doing', dueDate: past });
    insertWithDue({ id: 'c', title: 'past-done', status: 'done', dueDate: past });
    insertWithDue({ id: 'd', title: 'future-todo', status: 'todo', dueDate: future });

    const { body } = await listPage('overdue=true');
    expect(body.data.map((t: { title: string }) => t.title).sort()).toEqual([
      'past-doing',
      'past-todo',
    ]);
  });

  it('combines overdue with ?status', async () => {
    const past = '2020-01-01T00:00:00.000Z';
    insertWithDue({ id: 'a', title: 'past-todo', status: 'todo', dueDate: past });
    insertWithDue({ id: 'b', title: 'past-doing', status: 'doing', dueDate: past });

    const { body } = await listPage('overdue=true&status=doing');
    expect(body.data.map((t: { title: string }) => t.title)).toEqual(['past-doing']);
  });

  it('combines due-date filters with ?q', async () => {
    const past = '2020-01-01T00:00:00.000Z';
    insertWithDue({ id: 'a', title: 'Buy milk', status: 'todo', dueDate: past });
    insertWithDue({ id: 'b', title: 'Walk the dog', status: 'todo', dueDate: past });

    const { body } = await listPage('overdue=true&q=buy');
    expect(body.data.map((t: { title: string }) => t.title)).toEqual(['Buy milk']);
  });

  it('paginates across a due-date filtered set', async () => {
    const past = '2020-01-01T00:00:00.000Z';
    for (let i = 1; i <= 3; i++) {
      insertWithDue({
        id: `id-${i}`,
        title: `t${i}`,
        status: 'todo',
        dueDate: past,
        createdAt: `2026-01-01T00:00:0${i}.000Z`,
      });
    }
    // A non-matching task should stay excluded across both pages.
    insertWithDue({ id: 'future', title: 'future', dueDate: '2099-01-01T00:00:00.000Z' });

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const base = 'overdue=true&limit=2';
      const q = cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
      const { body } = await listPage(q);
      seen.push(...body.data.map((t: { title: string }) => t.title));
      cursor = body.nextCursor;
      expect(++pages).toBeLessThan(10);
    } while (cursor);

    expect(seen.sort()).toEqual(['t1', 't2', 't3']);
  });

  it('rejects an invalid datetime in dueBefore/dueAfter with 400', async () => {
    expect((await listPage('dueBefore=not-a-date')).status).toBe(400);
    expect((await listPage('dueAfter=2026-13-01')).status).toBe(400);
  });

  it('rejects a non-boolean overdue with 400', async () => {
    expect((await listPage('overdue=yes')).status).toBe(400);
    expect((await listPage('overdue=1')).status).toBe(400);
  });
});

describe('GET /tasks/stats', () => {
  it('returns zeroed counts when there are no tasks', async () => {
    const res = await app.request('/tasks/stats');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 0,
      byStatus: { todo: 0, doing: 0, done: 0 },
    });
  });

  it('counts tasks grouped by status', async () => {
    await createTask({ title: 'a', status: 'todo' });
    await createTask({ title: 'b', status: 'todo' });
    await createTask({ title: 'c', status: 'doing' });
    await createTask({ title: 'd', status: 'done' });

    const res = await app.request('/tasks/stats');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total: 4,
      byStatus: { todo: 2, doing: 1, done: 1 },
    });
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

describe('PATCH /tasks/:id/status', () => {
  async function patchStatus(id: string, status: unknown) {
    return app.request(`/tasks/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  it('applies a legal transition todo → doing and bumps updatedAt', async () => {
    const created = await (await createTask({ title: 'move me' })).json();
    expect(created.status).toBe('todo');

    const res = await patchStatus(created.id, 'doing');
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.status).toBe('doing');
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it('allows doing → done, doing → todo, and done → doing (reopen)', async () => {
    const doing = await (await createTask({ title: 'a', status: 'doing' })).json();
    expect((await patchStatus(doing.id, 'done')).status).toBe(200);

    const doing2 = await (await createTask({ title: 'b', status: 'doing' })).json();
    expect((await patchStatus(doing2.id, 'todo')).status).toBe(200);

    const done = await (await createTask({ title: 'c', status: 'done' })).json();
    const reopened = await patchStatus(done.id, 'doing');
    expect(reopened.status).toBe(200);
    expect((await reopened.json()).status).toBe('doing');
  });

  it('rejects an illegal transition todo → done with 422', async () => {
    const created = await (await createTask({ title: 'skip' })).json();
    const res = await patchStatus(created.id, 'done');
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/illegal status transition/i);
    // Task is unchanged.
    const after = await (await app.request(`/tasks/${created.id}`)).json();
    expect(after.status).toBe('todo');
  });

  it('treats a same-status request as an idempotent no-op (200, updatedAt unchanged)', async () => {
    const created = await (await createTask({ title: 'noop' })).json();
    const res = await patchStatus(created.id, 'todo');
    expect(res.status).toBe(200);
    const after = await res.json();
    expect(after.status).toBe('todo');
    expect(after.updatedAt).toBe(created.updatedAt);
  });

  it('returns 404 for an unknown task', async () => {
    const res = await patchStatus('does-not-exist', 'doing');
    expect(res.status).toBe(404);
  });

  it('rejects an invalid status value with 400', async () => {
    const created = await (await createTask({ title: 'x' })).json();
    expect((await patchStatus(created.id, 'archived')).status).toBe(400);
  });
});

describe('isLegalTransition', () => {
  it('allows forward moves and reopen', () => {
    expect(isLegalTransition('todo', 'doing')).toBe(true);
    expect(isLegalTransition('doing', 'done')).toBe(true);
    expect(isLegalTransition('doing', 'todo')).toBe(true);
    expect(isLegalTransition('done', 'doing')).toBe(true);
  });

  it('allows same-status (idempotent)', () => {
    expect(isLegalTransition('todo', 'todo')).toBe(true);
    expect(isLegalTransition('done', 'done')).toBe(true);
  });

  it('rejects skips', () => {
    expect(isLegalTransition('todo', 'done')).toBe(false);
    expect(isLegalTransition('done', 'todo')).toBe(false);
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
