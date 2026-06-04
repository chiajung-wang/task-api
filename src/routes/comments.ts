import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { CommentRepository } from '../repositories/comments.js';
import { createCommentSchema, updateCommentSchema } from '../schemas/comment.js';

export function commentRoutes(comments: CommentRepository) {
  const router = new Hono();

  router.post('/:id/comments', zValidator('json', createCommentSchema), (c) => {
    const comment = comments.addComment(c.req.param('id'), c.req.valid('json'));
    if (!comment) return c.json({ error: 'Task not found' }, 404);
    return c.json(comment, 201);
  });

  router.get('/:id/comments', (c) => {
    const taskId = c.req.param('id');
    if (!comments.taskExists(taskId)) return c.json({ error: 'Task not found' }, 404);
    return c.json(comments.listComments(taskId));
  });

  router.patch('/:id/comments/:commentId', zValidator('json', updateCommentSchema), (c) => {
    const taskId = c.req.param('id');
    if (!comments.taskExists(taskId)) return c.json({ error: 'Task not found' }, 404);
    const updated = comments.updateComment(taskId, c.req.param('commentId'), c.req.valid('json'));
    if (!updated) return c.json({ error: 'Comment not found' }, 404);
    return c.json(updated);
  });

  router.delete('/:id/comments/:commentId', (c) => {
    if (!comments.deleteComment(c.req.param('commentId'))) {
      return c.json({ error: 'Comment not found' }, 404);
    }
    return c.body(null, 204);
  });

  return router;
}
