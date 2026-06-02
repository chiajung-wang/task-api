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

describe('POST /tasks/:id/comments', () => {
  async function addComment(taskId: string, body: Record<string, unknown>) {
    return app.request(`/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('creates a comment on an existing task', async () => {
    const { id } = await (await createTask({ title: 'has comments' })).json();
    const res = await addComment(id, { body: 'first comment', author: 'alice' });
    expect(res.status).toBe(201);
    const comment = await res.json();
    expect(comment).toMatchObject({
      taskId: id,
      body: 'first comment',
      author: 'alice',
    });
    expect(comment.id).toBeTypeOf('string');
    expect(comment.createdAt).toBeTypeOf('string');
  });

  it('defaults author to null when omitted', async () => {
    const { id } = await (await createTask({ title: 'anon' })).json();
    const res = await addComment(id, { body: 'no author' });
    expect(res.status).toBe(201);
    expect((await res.json()).author).toBeNull();
  });

  it('returns 404 for an unknown task', async () => {
    const res = await addComment('does-not-exist', { body: 'orphan' });
    expect(res.status).toBe(404);
  });

  it('rejects a missing body with 400', async () => {
    const { id } = await (await createTask({ title: 'x' })).json();
    expect((await addComment(id, {})).status).toBe(400);
    expect((await addComment(id, { body: '' })).status).toBe(400);
  });
});

describe('GET /tasks/:id/comments', () => {
  /** Inserts a comment row directly so created_at is controllable. */
  function insertComment(row: { id: string; taskId: string; body: string; createdAt: string }) {
    db.prepare(
      `INSERT INTO comments (id, task_id, body, author, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(row.id, row.taskId, row.body, null, row.createdAt);
  }

  it('lists comments oldest-first', async () => {
    const { id } = await (await createTask({ title: 'has comments' })).json();
    // Inserted out of chronological order to prove the query sorts, not insertion order.
    insertComment({ id: 'c2', taskId: id, body: 'second', createdAt: '2026-01-01T00:00:01.000Z' });
    insertComment({ id: 'c3', taskId: id, body: 'third', createdAt: '2026-01-01T00:00:02.000Z' });
    insertComment({ id: 'c1', taskId: id, body: 'first', createdAt: '2026-01-01T00:00:00.000Z' });

    const res = await app.request(`/tasks/${id}/comments`);
    expect(res.status).toBe(200);
    const comments = await res.json();
    expect(comments.map((c: { body: string }) => c.body)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('returns an empty array for a task with no comments', async () => {
    const { id } = await (await createTask({ title: 'quiet' })).json();
    const res = await app.request(`/tasks/${id}/comments`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns 404 for an unknown task', async () => {
    const res = await app.request('/tasks/does-not-exist/comments');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /tasks/:id/comments/:commentId', () => {
  async function addComment(taskId: string, body: Record<string, unknown>) {
    return app.request(`/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('deletes a comment and removes it from the list', async () => {
    const { id } = await (await createTask({ title: 'has comments' })).json();
    const comment = await (await addComment(id, { body: 'delete me' })).json();

    const res = await app.request(`/tasks/${id}/comments/${comment.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const list = await (await app.request(`/tasks/${id}/comments`)).json();
    expect(list).toEqual([]);
  });

  it('returns 404 for an unknown comment', async () => {
    const { id } = await (await createTask({ title: 'x' })).json();
    const res = await app.request(`/tasks/${id}/comments/does-not-exist`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('cascades: deleting a task removes its comments', async () => {
    const { id } = await (await createTask({ title: 'doomed' })).json();
    await addComment(id, { body: 'orphan-to-be' });

    expect((await app.request(`/tasks/${id}`, { method: 'DELETE' })).status).toBe(204);

    // The task is gone, so the list endpoint 404s; assert no rows survive in the db.
    const remaining = db.prepare('SELECT COUNT(*) AS n FROM comments WHERE task_id = ?').get(id) as {
      n: number;
    };
    expect(remaining.n).toBe(0);
  });
});
