import { z } from 'zod';
import { decodeCursor } from '../lib/cursor.js';

export const taskStatuses = ['todo', 'doing', 'done'] as const;
export const taskStatusSchema = z.enum(taskStatuses);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: taskStatusSchema.optional(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    status: taskStatusSchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined) return undefined;
      try {
        return decodeCursor(raw);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Malformed cursor' });
        return z.NEVER;
      }
    }),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
