import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

let app: ReturnType<typeof createTestApp>['app'];

beforeEach(() => {
  const ctx = createTestApp();
  app = ctx.app;
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
