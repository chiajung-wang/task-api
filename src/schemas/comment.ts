import { z } from 'zod';

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  author: string | null;
  createdAt: string;
}

export const createCommentSchema = z.object({
  body: z.string().min(1).max(2000),
  author: z.string().min(1).max(100).optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
