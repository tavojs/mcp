import { z } from "zod";

const sourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["website", "cli", "framework", "ui"]),
  version: z.string().min(1),
  url: z.string().optional(),
});

export const runtimeSchema = z.enum(["browser", "server", "build"]);

const relatedDocumentSchema = z.object({
  title: z.string().min(1),
  href: z.string().startsWith("/"),
  description: z.string(),
});

export const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  markdown: z.string(),
});

export const documentSchema = z.object({
  id: z.string().min(1),
  section: z.string().min(1),
  slug: z.string(),
  title: z.string().min(1),
  description: z.string(),
  keywords: z.array(z.string()),
  kind: z.enum(["quickstart", "guide", "concept", "reference"]).optional(),
  prerequisites: z.array(z.string()).optional(),
  outcomes: z.array(z.string()).optional(),
  runtime: z.array(runtimeSchema).optional(),
  related: z.array(relatedDocumentSchema).optional(),
  canonicalPath: z.string().startsWith("/"),
  sections: z.array(sectionSchema),
  sourceId: z.string().min(1),
});

export const apiSymbolSchema = z.object({
  name: z.string().min(1),
  anchor: z.string().min(1).optional(),
  kind: z.string().optional(),
  signature: z.string().optional(),
  description: z.string(),
  runtime: z.array(runtimeSchema).optional(),
  stability: z.string().optional(),
  related: z.string().startsWith("/").optional(),
});

export const apiEntrySchema = z.object({
  entrypoint: z.string().min(1),
  symbols: z.array(apiSymbolSchema),
});

const componentPropertySchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().default(false),
  description: z.string(),
  defaultValue: z.string().optional(),
});

const componentPreviewSchema = z.object({
  available: z.boolean(),
  fixture: z.string().min(1),
});

export const componentSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    category: z.string().min(1),
    importPath: z.string().min(1),
    cssImportPath: z.string().optional(),
    description: z.string(),
    status: z.enum(["stable", "experimental"]).optional(),
    summary: z.string(),
    whenToUse: z.string(),
    avoidWhen: z.string(),
    props: z.array(componentPropertySchema),
    examples: z.array(
      z.object({
        title: z.string(),
        code: z.string(),
        requiredImports: z.array(z.string()).optional(),
      }),
    ),
    composition: z.record(z.string(), z.unknown()),
    accessibilityGuidance: z.object({
      summary: z.string(),
      checklist: z.array(z.string()),
    }),
    searchTerms: z.array(z.string()),
    capability: z.string().optional(),
    maturity: z.string().optional(),
    requiredImports: z.array(z.string()).optional(),
    stateOwnership: z.string().optional(),
    limitations: z.array(z.string()).optional(),
    preview: componentPreviewSchema.optional(),
  })
  .passthrough();

export const tokenSchema = z
  .object({
    name: z.string().min(1),
    cssVariable: z.string().min(1),
    group: z.string().min(1),
  })
  .passthrough();

export const contentManifestSchema = z.object({
  schemaVersion: z.literal(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string(),
  sources: z.array(sourceSchema),
  documents: z.array(documentSchema),
  api: z.object({
    core: z.array(apiEntrySchema),
    ui: z.array(apiEntrySchema),
  }),
  components: z.array(componentSchema),
  tokens: z.array(tokenSchema),
  commands: z.object({
    tavo: z.string(),
    tavoUi: z.string(),
  }),
});

export type ContentManifest = z.infer<typeof contentManifestSchema>;
export type ContentDocument = ContentManifest["documents"][number];
export type ComponentRecord = ContentManifest["components"][number];
