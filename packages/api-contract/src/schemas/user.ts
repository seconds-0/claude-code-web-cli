import { z } from "zod";
import { uuidSchema, timestampSchema } from "./common.js";

export const userSchema = z.object({
  id: uuidSchema,
  clerkId: z.string(),
  email: z.string().email(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const userResponseSchema = z.object({
  user: userSchema,
});

export type User = z.infer<typeof userSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
