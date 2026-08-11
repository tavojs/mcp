import { z } from "zod";
import {
  apiSymbolSchema,
  componentSchema,
  documentSchema,
  runtimeSchema,
} from "./content.js";
import { tokenBudgetSchema, toolOutputSchema } from "./common.js";

const searchScopeSchema = z.enum([
  "all",
  "docs",
  "api",
  "components",
  "tokens",
]);

const searchMatchSchema = z.object({
  id: z.string(),
  scope: z.enum(["docs", "api", "components", "tokens"]),
  title: z.string(),
  description: z.string(),
  uri: z.string(),
  score: z.number(),
});

const apiRecordSchema = apiSymbolSchema.extend({
  package: z.enum(["core", "ui"]),
  entrypoint: z.string(),
});

const componentSummarySchema = z.object({
  name: z.string(),
  slug: z.string(),
  category: z.string(),
  importPath: z.string(),
  summary: z.string(),
  whenToUse: z.string(),
  avoidWhen: z.string(),
  accessibility: z.string(),
  status: z.enum(["stable", "experimental"]).optional(),
  capability: z.string().optional(),
  maturity: z.string().optional(),
  requiredImports: z.array(z.string()).optional(),
  stateOwnership: z.string().optional(),
  limitations: z.array(z.string()).optional(),
  preview: z
    .object({
      available: z.boolean(),
      fixture: z.string(),
    })
    .optional(),
});

const documentSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
  kind: z.enum(["quickstart", "guide", "concept", "reference"]).optional(),
  prerequisites: z.array(z.string()),
  outcomes: z.array(z.string()),
  runtime: z.array(runtimeSchema),
  related: z.array(
    z.object({
      title: z.string(),
      href: z.string(),
      description: z.string(),
    }),
  ),
  canonicalPath: z.string(),
  sections: z.array(z.object({ id: z.string(), title: z.string() })),
});

export const searchTavoInputSchema = z.object({
  query: z.string().min(2),
  scope: searchScopeSchema.default("all"),
  limit: z.number().int().min(1).max(20).default(8),
  maxTokens: tokenBudgetSchema,
});

export const searchTavoOutputSchema = toolOutputSchema(
  z.object({
    query: z.string(),
    scope: searchScopeSchema,
    matches: z.array(searchMatchSchema),
  }),
);

export const getTavoDocumentInputSchema = z.object({
  id: z.string().min(1),
  detail: z.enum(["summary", "full"]).default("full"),
  maxTokens: tokenBudgetSchema,
});

export const getTavoDocumentOutputSchema = toolOutputSchema(
  z.union([documentSchema, documentSummarySchema]),
);

export const findTavoComponentsInputSchema = z.object({
  query: z.string().min(2),
  category: z.string().optional(),
  detail: z.enum(["summary", "full"]).default("summary"),
  limit: z.number().int().min(1).max(10).default(5),
  maxTokens: tokenBudgetSchema,
});

export const findTavoComponentsOutputSchema = toolOutputSchema(
  z.object({
    query: z.string(),
    category: z.string().nullable(),
    components: z.array(z.union([componentSchema, componentSummarySchema])),
  }),
);

export const lookupTavoApiInputSchema = z.object({
  query: z.string().min(1),
  package: z.enum(["all", "core", "ui"]).default("all"),
  limit: z.number().int().min(1).max(20).default(10),
  maxTokens: tokenBudgetSchema,
});

export const lookupTavoApiOutputSchema = toolOutputSchema(
  z.object({
    query: z.string(),
    package: z.enum(["all", "core", "ui"]),
    symbols: z.array(apiRecordSchema),
  }),
);
