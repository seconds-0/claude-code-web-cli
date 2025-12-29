import { z } from "zod";

// Common response schemas
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  requestId: z.string().optional(),
});

export const successResponseSchema = z.object({
  success: z.literal(true),
});

// Pagination
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    hasMore: z.boolean(),
  });

// UUID validation
export const uuidSchema = z.string().uuid();

// Timestamps
export const timestampSchema = z.string().datetime();

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type SuccessResponse = z.infer<typeof successResponseSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
