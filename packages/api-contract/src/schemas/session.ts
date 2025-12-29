import { z } from "zod";
import { uuidSchema, timestampSchema } from "./common.js";

export const sessionModeSchema = z.enum(["engineer", "guided"]);

export const sessionSchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  tmuxSessionName: z.string(),
  mode: sessionModeSchema,
  status: z.string(),
  createdAt: timestampSchema,
});

export const previewSchema = z.object({
  id: uuidSchema,
  sessionId: uuidSchema,
  port: z.number().int().positive(),
  publicUrl: z.string().url().nullable(),
  createdAt: timestampSchema,
});

// Request schemas
export const createSessionRequestSchema = z.object({
  mode: sessionModeSchema.default("engineer"),
});

// Response schemas
export const sessionResponseSchema = z.object({
  session: sessionSchema,
  terminalUrl: z.string().url(),
});

export const sessionsResponseSchema = z.object({
  sessions: z.array(sessionSchema),
});

export type SessionMode = z.infer<typeof sessionModeSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Preview = z.infer<typeof previewSchema>;
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SessionsResponse = z.infer<typeof sessionsResponseSchema>;
