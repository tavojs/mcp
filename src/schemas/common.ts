import { z } from "zod";
import {
  DEFAULT_TOOL_TOKENS,
  MAX_TOOL_TOKENS,
  MIN_TOOL_TOKENS,
} from "../protocol.js";

const sourceSchema = z.object({ uri: z.string(), title: z.string() });

const diagnosticSchema = z.object({
  code: z.string(),
  level: z.enum(["error", "warning"]),
  message: z.string(),
});

const continuationSchema = z.object({
  resourceUri: z.string(),
  nextSection: z.string().optional(),
});

const metaSchema = z.object({
  truncated: z.boolean(),
  estimatedTokens: z.number().int().nonnegative(),
  maxTokens: z.number().int().min(MIN_TOOL_TOKENS).max(MAX_TOOL_TOKENS),
  continuation: continuationSchema.optional(),
});

export const toolOutputSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    schemaVersion: z.literal(1),
    ok: z.boolean(),
    data: z.union([dataSchema, z.null()]),
    sources: z.array(sourceSchema),
    diagnostics: z.array(diagnosticSchema),
    meta: metaSchema,
  });

export const tokenBudgetSchema = z
  .number()
  .int()
  .min(MIN_TOOL_TOKENS)
  .max(MAX_TOOL_TOKENS)
  .default(DEFAULT_TOOL_TOKENS);
