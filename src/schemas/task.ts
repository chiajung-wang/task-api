import { z } from 'zod';
import { decodeCursor } from '../lib/cursor.js';

export const taskStatuses = ['todo', 'doing', 'done'] as const;
export const taskStatusSchema = z.enum(taskStatuses);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

// Legal status transitions (forward + reopen). Same-status is always allowed as
// an idempotent no-op; any move not listed here is rejected.
const statusTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ['doing'],
  doing: ['done', 'todo'],
  done: ['doing'],
};

export function isLegalTransition(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || statusTransitions[from].includes(to);
}

export const statusTransitionSchema = z.object({ status: taskStatusSchema });
export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
}

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: taskStatusSchema.optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    status: taskStatusSchema,
    dueDate: z.string().datetime({ offset: true }).nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  q: z.string().min(1).max(200).optional(),
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
