import { z } from "zod";
import { tokenBudgetSchema, toolOutputSchema } from "./common.js";

const tavoProtocolSchema = z.object({
  schemaVersion: z.literal(1),
  command: z.string(),
  ok: z.boolean(),
  project: z.object({ fingerprint: z.string() }),
  data: z.unknown(),
  diagnostics: z.array(z.unknown()),
  nextActions: z.array(z.object({ command: z.string(), reason: z.string() })),
  metrics: z.object({
    durationMs: z.number(),
    bytes: z.number(),
    estimatedTokens: z.number(),
  }),
  documentationCompatibility: z.unknown().optional(),
});

export const projectToolOutputSchema = toolOutputSchema(tavoProtocolSchema);

export const getProjectContextInputSchema = z.object({
  task: z.string().optional(),
  target: z.string().optional(),
  detail: z.enum(["summary", "full"]).default("summary"),
  maxTokens: tokenBudgetSchema,
});

export const inspectProjectInputSchema = z.object({
  kind: z.enum(["route", "component", "store", "file", "api"]),
  target: z.string().min(1).max(500),
  maxTokens: tokenBudgetSchema,
});

export const verifyProjectInputSchema = z.object({
  files: z.array(z.string().min(1).max(500)).max(100).optional(),
  smoke: z.boolean().default(false),
  maxTokens: tokenBudgetSchema,
});
